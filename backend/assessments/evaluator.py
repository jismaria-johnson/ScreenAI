import base64
import json
import logging
import subprocess
import time
import nbformat
from django.conf import settings

logger = logging.getLogger(__name__)


class SandboxResult:
    def __init__(self, exit_code, stdout, stderr, duration, is_timeout=False, is_oom=False):
        self.exit_code = exit_code
        self.stdout = stdout
        self.stderr = stderr
        self.duration = duration
        self.is_timeout = is_timeout
        self.is_oom = is_oom


def extract_candidate_answers_from_notebook(notebook_path, question_ids):
    """
    Reads the notebook file. Extracts the candidate answer code block for each question ID.
    Locates answer code cells by their cell.metadata['screenai_question_id'].
    Takes exactly the first matching code cell per question.
    Silently ignores extra/unlabeled cells.
    Returns a dict mapping question_id -> candidate_code (str).
    """
    answers = {}
    for q_id in question_ids:
        answers[q_id] = ""

    try:
        with open(notebook_path, "r", encoding="utf-8") as f:
            nb = nbformat.read(f, as_version=4)
    except Exception as e:
        logger.error(f"Failed to read notebook {notebook_path}: {e}")
        return answers

    seen_questions = set()
    for cell in nb.cells:
        if cell.cell_type != "code":
            continue
        metadata = cell.get("metadata", {})
        q_id = metadata.get("screenai_question_id")
        if q_id and q_id in question_ids:
            if q_id not in seen_questions:
                answers[q_id] = cell.get("source", "")
                seen_questions.add(q_id)

    return answers


def build_private_test_harness(candidate_answers, grading_questions):
    """
    Constructs the python script that will run inside the Docker container.
    Serializes candidate answers and hidden tests into a base64 payload to prevent escaping issues.
    """
    questions_payload = []
    for q in grading_questions:
        q_id = q["id"]
        questions_payload.append({
            "id": q_id,
            "candidate_code": candidate_answers.get(q_id, ""),
            "hidden_tests": q.get("hidden_tests", ""),
            "marks": q.get("marks", 0)
        })

    payload_json = json.dumps(questions_payload)
    payload_b64 = base64.b64encode(payload_json.encode("utf-8")).decode("utf-8")

    harness_code = f"""
import base64
import json
import sys
import traceback
import io

payload_b64 = "{payload_b64}"
questions_data = json.loads(base64.b64decode(payload_b64.encode("utf-8")).decode("utf-8"))

results = []

for q in questions_data:
    q_id = q["id"]
    code = q["candidate_code"]
    tests = q["hidden_tests"]
    max_marks = q["marks"]
    
    ns = {{}}
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = stdout_capture
    sys.stderr = stderr_capture
    
    status = "passed"
    feedback = ""
    passed_cnt = 0
    failed_cnt = 0
    
    try:
        if not code.strip():
            status = "skipped"
            feedback = "No answer provided."
        else:
            try:
                exec(code, ns)
            except SyntaxError as se:
                status = "error"
                feedback = f"Syntax error: {{se}}"
                traceback.print_exc(file=stderr_capture)
            except Exception as e:
                status = "error"
                feedback = f"Runtime error: {{e}}"
                traceback.print_exc(file=stderr_capture)
            
            if status != "error":
                # Execute hidden tests
                # If there are helper functions, indentations, or function definitions, execute as a single block
                has_indentation = any(line.startswith(" ") or line.startswith("\\t") for line in tests.splitlines())
                if ":" in tests or has_indentation:
                    try:
                        exec(tests, ns)
                        passed_cnt = 1
                    except AssertionError as ae:
                        failed_cnt = 1
                        status = "failed"
                        feedback = f"Assertion failed: {{ae}}"
                        traceback.print_exc(file=stderr_capture)
                    except Exception as e:
                        failed_cnt = 1
                        status = "error"
                        feedback = f"Test execution error: {{e}}"
                        traceback.print_exc(file=stderr_capture)
                else:
                    lines = [line.strip() for line in tests.splitlines() if line.strip()]
                    for line in lines:
                        try:
                            exec(line, ns)
                            passed_cnt += 1
                        except AssertionError as ae:
                            failed_cnt += 1
                            status = "failed"
                            feedback += f"Assertion failed on: {{line}}\\n"
                        except Exception as e:
                            failed_cnt += 1
                            status = "error"
                            feedback += f"Error executing: {{line}} ({{e}})\\n"
                    if failed_cnt > 0:
                        if status != "error":
                            status = "failed"
                    elif passed_cnt == 0:
                        passed_cnt = 1
    except Exception as e:
        status = "error"
        feedback = f"Internal harness error: {{e}}"
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        
    stdout_val = stdout_capture.getvalue()
    stderr_val = stderr_capture.getvalue()
    
    combined_log = ""
    if stdout_val:
        combined_log += f"--- stdout ---\\n{{stdout_val}}\\n"
    if stderr_val:
        combined_log += f"--- stderr ---\\n{{stderr_val}}\\n"
    if feedback:
        combined_log += f"--- feedback ---\\n{{feedback}}\\n"
        
    if len(combined_log) > 2000:
        combined_log = combined_log[:1997] + "..."
        
    results.append({{
        "id": q_id,
        "status": status,
        "passed_tests": passed_cnt,
        "failed_tests": failed_cnt,
        "safe_stdout_summary": combined_log,
        "feedback": feedback[:1000]
    }})

print("---START_JSON---")
print(json.dumps(results))
print("---END_JSON---")
"""
    return harness_code


def run_docker_sandbox(harness_script_code):
    """
    Spawns a Docker sandbox to execute the harness script.
    Applies strict resource limits:
    - --network none
    - --user 65534:65534 (nobody)
    - --read-only
    - --tmpfs /tmp:rw,size=64m,exec
    - --memory <EVALUATOR_MEMORY_MB>m
    - --cpus <EVALUATOR_CPU_LIMIT>
    - --pids-limit 64
    - --security-opt no-new-privileges
    - --rm
    """
    image = getattr(settings, "EVALUATOR_DOCKER_IMAGE", "python:3.11-slim")
    timeout = getattr(settings, "EVALUATOR_TIMEOUT_SECONDS", 30)
    memory_mb = getattr(settings, "EVALUATOR_MEMORY_MB", 256)
    cpu_limit = getattr(settings, "EVALUATOR_CPU_LIMIT", 1.0)

    # docker run command
    cmd = [
        "docker", "run", "-i", "--rm",
        "--network", "none",
        "--user", "65534:65534",
        "--read-only",
        "--tmpfs", "/tmp:rw,size=64m,exec",
        "--memory", f"{memory_mb}m",
        "--cpus", str(cpu_limit),
        "--pids-limit", "64",
        "--security-opt", "no-new-privileges",
        image,
        "python3", "-c", "import sys; exec(sys.stdin.read())"
    ]

    start_time = time.time()
    try:
        result = subprocess.run(
            cmd,
            input=harness_script_code.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout
        )
        duration = time.time() - start_time
        # Check if container was OOM killed (standard Docker exit code for OOM/SIGKILL is 137)
        is_oom = (result.returncode == 137)
        return SandboxResult(
            exit_code=result.returncode,
            stdout=result.stdout.decode("utf-8", errors="replace"),
            stderr=result.stderr.decode("utf-8", errors="replace"),
            duration=duration,
            is_timeout=False,
            is_oom=is_oom
        )
    except subprocess.TimeoutExpired as te:
        duration = time.time() - start_time
        stdout = te.stdout.decode("utf-8", errors="replace") if te.stdout else ""
        stderr = te.stderr.decode("utf-8", errors="replace") if te.stderr else ""
        return SandboxResult(
            exit_code=-1,
            stdout=stdout,
            stderr=stderr,
            duration=duration,
            is_timeout=True
        )
    except FileNotFoundError:
        # Docker command not found on system
        raise RuntimeError("Docker command not found. Docker is likely not installed or not in PATH.")
    except subprocess.CalledProcessError as cpe:
        # Other subprocess invocation failure
        raise RuntimeError(f"Docker execution failed: {cpe}")


def run_candidate_code_preview(code, timeout_seconds=5):
    """
    Runs candidate's code in the Docker sandbox WITHOUT hidden tests.
    Preview-only execution — returns raw stdout/stderr/exit_code for display
    in the browser workspace. Not used for grading.

    Returns a SandboxResult or raises RuntimeError if Docker unavailable.
    """
    if not code or not code.strip():
        return SandboxResult(
            exit_code=0,
            stdout="(No code to run.)\n",
            stderr="",
            duration=0.0
        )

    # Build a simple preview harness: just run the candidate code,
    # capturing output. No hidden tests, no assertions.
    preview_harness = f"""
import sys
import io
import traceback

_code = {repr(code)}
_stdout_capture = io.StringIO()
_stderr_capture = io.StringIO()
_old_stdout = sys.stdout
_old_stderr = sys.stderr
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
try:
    exec(compile(_code, "<candidate_code>", "exec"))
except SystemExit:
    pass
except Exception as _e:
    traceback.print_exc(file=_stderr_capture)
finally:
    sys.stdout = _old_stdout
    sys.stderr = _old_stderr
print(_stdout_capture.getvalue(), end="")
print(_stderr_capture.getvalue(), end="", file=sys.stderr)
"""

    image = getattr(settings, "EVALUATOR_DOCKER_IMAGE", "python:3.11-slim")
    memory_mb = getattr(settings, "EVALUATOR_MEMORY_MB", 256)
    cpu_limit = getattr(settings, "EVALUATOR_CPU_LIMIT", 1.0)

    cmd = [
        "docker", "run", "-i", "--rm",
        "--network", "none",
        "--user", "65534:65534",
        "--read-only",
        "--tmpfs", "/tmp:rw,size=64m,exec",
        "--memory", f"{memory_mb}m",
        "--cpus", str(cpu_limit),
        "--pids-limit", "64",
        "--security-opt", "no-new-privileges",
        image,
        "python3", "-c", "import sys; exec(sys.stdin.read())"
    ]

    start_time = time.time()
    try:
        result = subprocess.run(
            cmd,
            input=preview_harness.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds
        )
        duration = time.time() - start_time
        return SandboxResult(
            exit_code=result.returncode,
            stdout=result.stdout.decode("utf-8", errors="replace"),
            stderr=result.stderr.decode("utf-8", errors="replace"),
            duration=duration,
            is_timeout=False,
            is_oom=(result.returncode == 137)
        )
    except subprocess.TimeoutExpired as te:
        duration = time.time() - start_time
        stdout = te.stdout.decode("utf-8", errors="replace") if te.stdout else ""
        stderr = te.stderr.decode("utf-8", errors="replace") if te.stderr else ""
        return SandboxResult(
            exit_code=-1,
            stdout=stdout,
            stderr=stderr + "\n[Execution timed out]",
            duration=duration,
            is_timeout=True
        )
    except FileNotFoundError:
        raise RuntimeError("Docker command not found. Docker is likely not installed or not in PATH.")
    except subprocess.CalledProcessError as cpe:
        raise RuntimeError(f"Docker execution failed: {cpe}")


def parse_harness_output(sandbox_result):

    """
    Parses the JSON list printed inside the ---START_JSON--- / ---END_JSON--- block from stdout.
    Returns the parsed results list.
    """
    stdout = sandbox_result.stdout
    start_marker = "---START_JSON---"
    end_marker = "---END_JSON---"

    if start_marker not in stdout or end_marker not in stdout:
        raise ValueError("Harness execution did not output structured results.")

    try:
        json_part = stdout.split(start_marker)[1].split(end_marker)[0].strip()
        return json.loads(json_part)
    except Exception as e:
        raise ValueError(f"Failed to parse harness output: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Structured Test-Case Evaluation (Browser Coding Assessment)
# ─────────────────────────────────────────────────────────────────────────────

SUPPORTED_LANGUAGES = {"python", "javascript"}

MAX_OUTPUT_BYTES = 8192  # per test case output truncation limit


def _build_python_test_harness(code: str, test_cases: list, function_name: str) -> str:
    """
    Builds a Python harness script that:
    1. Defines the candidate's function via exec()
    2. For each test case: parses JSON input, calls function, compares with expected, records result
    3. Emits structured JSON between markers — never reveals expected output in error paths.

    execution_mode assumed: "function"
    """
    payload = {
        "code": code,
        "test_cases": test_cases,
        "function_name": function_name,
    }
    payload_b64 = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")

    harness = f"""
import base64, json, sys, traceback, time, io, contextlib

_payload = json.loads(base64.b64decode("{payload_b64}".encode()).decode())
_code = _payload["code"]
_test_cases = _payload["test_cases"]
_fn_name = _payload["function_name"]

_ns = {{}}
_results = []

# Compile candidate code
try:
    exec(compile(_code, "<candidate_code>", "exec"), _ns)
except SyntaxError as _se:
    # All tests fail with syntax error
    for _tc in _test_cases:
        _results.append({{
            "test_case": _tc.get("order", 0),
            "input": _tc.get("input", ""),
            "actual_output": "",
            "status": "syntax_error",
            "runtime_ms": 0,
            "error": str(_se),
        }})
    print("---START_JSON---")
    print(json.dumps(_results))
    print("---END_JSON---")
    sys.exit(0)
except Exception as _ce:
    for _tc in _test_cases:
        _results.append({{
            "test_case": _tc.get("order", 0),
            "input": _tc.get("input", ""),
            "actual_output": "",
            "status": "runtime_error",
            "runtime_ms": 0,
            "error": str(_ce),
        }})
    print("---START_JSON---")
    print(json.dumps(_results))
    print("---END_JSON---")
    sys.exit(0)

_fn = _ns.get(_fn_name)
if _fn is None or not callable(_fn):
    for _tc in _test_cases:
        _results.append({{
            "test_case": _tc.get("order", 0),
            "input": _tc.get("input", ""),
            "actual_output": "",
            "status": "runtime_error",
            "runtime_ms": 0,
            "error": f"Function '{{_fn_name}}' not found in submitted code.",
        }})
    print("---START_JSON---")
    print(json.dumps(_results))
    print("---END_JSON---")
    sys.exit(0)

for _tc in _test_cases:
    _order = _tc.get("order", 0)
    _input_str = _tc.get("input", "")
    _expected_str = _tc.get("expected_output", "")
    _actual_out = ""
    _console_out = ""
    _status = "failed"
    _err = ""
    _t0 = time.time()
    try:
        _args = json.loads(_input_str) if _input_str.strip() else []
        if not isinstance(_args, list):
            _args = [_args]
        _stdout_buffer = io.StringIO()
        with contextlib.redirect_stdout(_stdout_buffer):
            _ret = _fn(*_args)
        _console_out = _stdout_buffer.getvalue()
        _actual_out = json.dumps(_ret, separators=(",", ":"))
        _expected_parsed = json.loads(_expected_str)
        _expected_norm = json.dumps(_expected_parsed, separators=(",", ":"))
        _status = "passed" if _actual_out == _expected_norm else "failed"
    except Exception as _ex:
        _actual_out = ""
        _console_out = _stdout_buffer.getvalue() if "_stdout_buffer" in locals() else ""
        _status = "runtime_error"
        _err = str(_ex)
    _runtime_ms = int((time.time() - _t0) * 1000)
    _results.append({{
        "test_case": _order,
        "input": _input_str,
        "actual_output": _actual_out,
        "console_output": _console_out[:{MAX_OUTPUT_BYTES}],
        "status": _status,
        "runtime_ms": _runtime_ms,
        "error": _err,
    }})

print("---START_JSON---")
print(json.dumps(_results))
print("---END_JSON---")
"""
    return harness


def _build_javascript_test_harness(code: str, test_cases: list, function_name: str) -> str:
    """
    Builds a Node.js harness script for JavaScript function-based evaluation.
    Runs inside a node:lts-slim Docker container.
    """
    payload = {
        "code": code,
        "test_cases": test_cases,
        "function_name": function_name,
    }
    payload_b64 = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")

    harness = f"""
const _payloadB64 = "{payload_b64}";
const _payload = JSON.parse(Buffer.from(_payloadB64, "base64").toString("utf-8"));
const _code = _payload.code;
const _testCases = _payload.test_cases;
const _fnName = _payload.function_name;

const _results = [];

let _fn;
try {{
    // Evaluate candidate code in a minimal sandbox namespace
    const _wrapper = new Function(
        "require",
        _code + "\\nreturn typeof " + _fnName + " !== 'undefined' ? " + _fnName + " : undefined;"
    );
    _fn = _wrapper(() => {{ throw new Error("require is not allowed"); }});
}} catch (e) {{
    const _errMsg = e.message || String(e);
    for (const _tc of _testCases) {{
        _results.push({{
            test_case: _tc.order || 0,
            input: _tc.input || "",
            actual_output: "",
            status: e instanceof SyntaxError ? "syntax_error" : "runtime_error",
            runtime_ms: 0,
            error: _errMsg,
        }});
    }}
    process.stdout.write("---START_JSON---\\n");
    process.stdout.write(JSON.stringify(_results) + "\\n");
    process.stdout.write("---END_JSON---\\n");
    process.exit(0);
}}

if (typeof _fn !== "function") {{
    for (const _tc of _testCases) {{
        _results.push({{
            test_case: _tc.order || 0,
            input: _tc.input || "",
            actual_output: "",
            status: "runtime_error",
            runtime_ms: 0,
            error: `Function '${{_fnName}}' not found in submitted code.`,
        }});
    }}
    process.stdout.write("---START_JSON---\\n");
    process.stdout.write(JSON.stringify(_results) + "\\n");
    process.stdout.write("---END_JSON---\\n");
    process.exit(0);
}}

for (const _tc of _testCases) {{
    const _order = _tc.order || 0;
    const _inputStr = _tc.input || "";
    const _expectedStr = _tc.expected_output || "";
    let _actualOut = "";
    let _consoleOut = "";
    let _status = "failed";
    let _err = "";
    const _t0 = Date.now();
    try {{
        let _args = JSON.parse(_inputStr.trim() || "[]");
        if (!Array.isArray(_args)) _args = [_args];
        const _capturedLogs = [];
        const _originalLog = console.log;
        console.log = (...args) => {{
            _capturedLogs.push(args.map((value) => {{
                try {{
                    return typeof value === "string" ? value : JSON.stringify(value);
                }} catch {{
                    return String(value);
                }}
            }}).join(" "));
        }};
        let _ret;
        try {{
            _ret = _fn(..._args);
        }} finally {{
            console.log = _originalLog;
        }}
        _consoleOut = _capturedLogs.join("\\n");
        _actualOut = JSON.stringify(_ret);
        const _expectedParsed = JSON.parse(_expectedStr);
        const _expectedNorm = JSON.stringify(_expectedParsed);
        _status = _actualOut === _expectedNorm ? "passed" : "failed";
    }} catch (e) {{
        _actualOut = "";
        if (!_consoleOut) _consoleOut = "";
        _status = "runtime_error";
        _err = e.message || String(e);
    }}
    const _runtimeMs = Date.now() - _t0;
    _results.push({{
        test_case: _order,
        input: _inputStr,
        actual_output: _actualOut,
        console_output: _consoleOut.slice(0, {MAX_OUTPUT_BYTES}),
        status: _status,
        runtime_ms: _runtimeMs,
        error: _err,
    }});
}}

process.stdout.write("---START_JSON---\\n");
process.stdout.write(JSON.stringify(_results) + "\\n");
process.stdout.write("---END_JSON---\\n");
"""
    return harness


def _run_docker_with_stdin(harness_script: str, language: str, timeout_seconds: int,
                           memory_mb: int = 256, cpu_limit: float = 1.0) -> "SandboxResult":
    """
    Runs a harness script in Docker. Selects the correct image and entry point per language.
    Applies strict resource and security limits.
    """
    if language == "python":
        image = getattr(settings, "EVALUATOR_DOCKER_IMAGE", "python:3.11-slim")
        entry = ["python3", "-c", "import sys; exec(sys.stdin.read())"]
        input_bytes = harness_script.encode("utf-8")
    elif language == "javascript":
        image = getattr(settings, "EVALUATOR_JS_DOCKER_IMAGE", "node:lts-slim")
        entry = ["node", "-e", "const fs=require('fs'); eval(fs.readFileSync('/dev/stdin','utf8'))"]
        input_bytes = harness_script.encode("utf-8")
    else:
        raise RuntimeError(f"Unsupported language for Docker execution: {language}")

    cmd = [
        "docker", "run", "-i", "--rm",
        "--network", "none",
        "--user", "65534:65534",
        "--read-only",
        "--tmpfs", "/tmp:rw,size=64m,exec",
        "--memory", f"{memory_mb}m",
        "--cpus", str(cpu_limit),
        "--pids-limit", "64",
        "--security-opt", "no-new-privileges",
        image,
    ] + entry

    start_time = time.time()
    try:
        result = subprocess.run(
            cmd,
            input=input_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds,
        )
        duration = time.time() - start_time
        return SandboxResult(
            exit_code=result.returncode,
            stdout=result.stdout.decode("utf-8", errors="replace"),
            stderr=result.stderr.decode("utf-8", errors="replace"),
            duration=duration,
            is_timeout=False,
            is_oom=(result.returncode == 137),
        )
    except subprocess.TimeoutExpired as te:
        duration = time.time() - start_time
        stdout = te.stdout.decode("utf-8", errors="replace") if te.stdout else ""
        stderr = te.stderr.decode("utf-8", errors="replace") if te.stderr else ""
        return SandboxResult(
            exit_code=-1,
            stdout=stdout,
            stderr=stderr + "\n[Execution timed out]",
            duration=duration,
            is_timeout=True,
        )
    except FileNotFoundError:
        raise RuntimeError("Docker command not found. Docker is likely not installed or not in PATH.")
    except subprocess.CalledProcessError as cpe:
        raise RuntimeError(f"Docker execution failed: {cpe}")


def _parse_structured_results(sandbox_res: "SandboxResult", test_cases: list) -> list:
    """
    Extracts structured per-test results from sandbox stdout.
    On timeout/OOM, marks all tests as timed_out/memory_limit_exceeded.
    On parse failure, marks all tests as runtime_error.
    Never exposes expected_output — caller injects it if the test case is visible.
    """
    if sandbox_res.is_timeout:
        return [
            {
                "test_case": tc.get("order", i + 1),
            "input": tc.get("input", ""),
            "actual_output": "",
            "console_output": "",
            "status": "time_limit_exceeded",
            "runtime_ms": 0,
            "error": "Time limit exceeded",
            }
            for i, tc in enumerate(test_cases)
        ]

    if sandbox_res.is_oom:
        return [
            {
                "test_case": tc.get("order", i + 1),
            "input": tc.get("input", ""),
            "actual_output": "",
            "console_output": "",
            "status": "memory_limit_exceeded",
            "runtime_ms": 0,
            "error": "Memory limit exceeded",
            }
            for i, tc in enumerate(test_cases)
        ]

    stdout = sandbox_res.stdout
    start_marker = "---START_JSON---"
    end_marker = "---END_JSON---"

    if start_marker in stdout and end_marker in stdout:
        try:
            json_part = stdout.split(start_marker)[1].split(end_marker)[0].strip()
            return json.loads(json_part)
        except Exception:
            pass

    # Fallback: harness itself crashed (e.g. Docker ran but harness errored before marker)
    stderr_preview = sandbox_res.stderr[:500] if sandbox_res.stderr else ""
    return [
        {
            "test_case": tc.get("order", i + 1),
            "input": tc.get("input", ""),
            "actual_output": "",
            "console_output": "",
            "status": "runtime_error",
            "runtime_ms": 0,
            "error": f"Execution failed. stderr: {stderr_preview}",
        }
        for i, tc in enumerate(test_cases)
    ]


def run_structured_test_cases(
    code: str,
    language: str,
    test_cases: list,
    function_name: str,
    time_limit_seconds: int = 5,
    memory_limit_mb: int = 256,
    include_expected_output: bool = True,
) -> list:
    """
    Runs candidate code against a list of structured test cases in a Docker sandbox.

    Args:
        code: Candidate source code string.
        language: "python" or "javascript".
        test_cases: List of {input, expected_output, order} dicts.
        function_name: The function to call (execution_mode="function").
        time_limit_seconds: Per-run time limit.
        memory_limit_mb: Memory limit for the container.
        include_expected_output: If True, inject expected_output into each result row
                                  (for visible tests shown to candidate). Set False for
                                  hidden test results sent to candidate.

    Returns:
        List of per-test-case result dicts.

    Raises:
        RuntimeError: If Docker is unavailable.
        ValueError: If language is unsupported.
    """
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language: {language}. Supported: {', '.join(sorted(SUPPORTED_LANGUAGES))}")

    if not code or not code.strip():
        return [
            {
                "test_case": tc.get("order", i + 1),
            "input": tc.get("input", ""),
            "expected_output": tc.get("expected_output", "") if include_expected_output else None,
            "actual_output": "",
            "console_output": "",
            "status": "no_code",
            "runtime_ms": 0,
            "error": "No code was submitted.",
            }
            for i, tc in enumerate(test_cases)
        ]

    if not test_cases:
        return []

    cpu_limit = getattr(settings, "EVALUATOR_CPU_LIMIT", 1.0)

    if language == "python":
        harness = _build_python_test_harness(code, test_cases, function_name)
    else:
        harness = _build_javascript_test_harness(code, test_cases, function_name)

    sandbox_res = _run_docker_with_stdin(
        harness_script=harness,
        language=language,
        timeout_seconds=time_limit_seconds + 5,  # outer Docker timeout is slightly larger
        memory_mb=memory_limit_mb,
        cpu_limit=cpu_limit,
    )

    raw_results = _parse_structured_results(sandbox_res, test_cases)

    # Build a lookup of test cases by order for expected_output injection
    tc_by_order = {tc.get("order", i + 1): tc for i, tc in enumerate(test_cases)}

    final = []
    for r in raw_results:
        order = r.get("test_case", 0)
        tc = tc_by_order.get(order, {})
        row = {
            "test_case": order,
            "input": r.get("input", tc.get("input", "")),
            "actual_output": r.get("actual_output", ""),
            "console_output": r.get("console_output", ""),
            "status": r.get("status", "failed"),
            "runtime_ms": r.get("runtime_ms", 0),
        }
        if include_expected_output:
            row["expected_output"] = tc.get("expected_output", "")
        if r.get("error"):
            row["error"] = r["error"]
        final.append(row)

    return final


def build_structured_hidden_harness(candidate_answers: dict, grading_questions: list) -> tuple:
    """
    Builds per-language harnesses for structured hidden-test evaluation during final submission.

    Args:
        candidate_answers: {question_id: {"code": str, "language": str}}
        grading_questions: list of question dicts from private_grading_snapshot with
                           hidden_test_cases, function_name, execution_mode, marks fields.

    Returns:
        (python_questions, js_questions) — partitioned by language for separate sandbox runs.
    """
    python_questions = []
    js_questions = []

    for q in grading_questions:
        q_id = q.get("id")
        answer_data = candidate_answers.get(q_id, {})
        if isinstance(answer_data, str):
            # Legacy format: just code string (no language info)
            code = answer_data
            language = "python"
        else:
            code = answer_data.get("code", "")
            language = answer_data.get("language", "python")

        hidden_tcs = q.get("hidden_test_cases", [])
        fn_name = q.get("function_name", "")
        marks = q.get("marks", 0)
        time_limit = q.get("time_limit_seconds", 5)
        mem_limit = q.get("memory_limit_mb") or 256

        item = {
            "id": q_id,
            "code": code,
            "test_cases": hidden_tcs,
            "function_name": fn_name,
            "marks": marks,
            "time_limit_seconds": time_limit,
            "memory_limit_mb": mem_limit,
        }

        if language == "javascript":
            js_questions.append(item)
        else:
            python_questions.append(item)

    return python_questions, js_questions
