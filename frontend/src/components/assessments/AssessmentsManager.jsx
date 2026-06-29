import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DataGrid,
  GridActionsCellItem,
} from "@mui/x-data-grid";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Paper,
  IconButton,
} from "@mui/material";
import API from "../../api/axiosConfig";

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
  </svg>
);

const VisibilityIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="6 3 20 12 6 21 6 3"/>
  </svg>
);

const CloneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
);

const ArchiveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="5" x="2" y="3" rx="1"/>
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/>
    <line x1="10" x2="14" y1="12" y2="12"/>
  </svg>
);

const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
  </svg>
);

const AddIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/>
    <path d="M12 5v14"/>
  </svg>
);

const ArrowUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 15-6-6-6 6"/>
  </svg>
);

const ArrowDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

const ClearIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/>
    <path d="M6 6l12 12"/>
  </svg>
);

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.3-4.3"/>
  </svg>
);

export default function AssessmentsManager({ showToast }) {
  // Directory States
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ordering, setOrdering] = useState("-updated_at");
  const [error, setError] = useState("");

  // Modal / Operations States
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [openFormModal, setOpenFormModal] = useState(false);
  const [openPreviewModal, setOpenPreviewModal] = useState(false);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Edit / Creation Form States
  const [isEditMode, setIsEditMode] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    instructions: "",
    duration_minutes: 60,
  });
  const [submittingTemplate, setSubmittingTemplate] = useState(false);

  // Question Form States
  const [openQuestionModal, setOpenQuestionModal] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [questionForm, setQuestionForm] = useState({
    title: "",
    prompt: "",
    marks: 10,
    execution_mode: "function",
    function_name: "",
    starter_code_per_language: { python: "" },
    visible_test_cases: [{ input: "", expected_output: "", explanation: "", order: 1 }],
    hidden_test_cases: [{ input: "", expected_output: "", explanation: "", order: 1 }],
    hidden_tests: "",
  });
  const [submittingQuestion, setSubmittingQuestion] = useState(false);

  // Load Templates
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page: page + 1,
        page_size: pageSize,
        ordering: ordering,
      };
      if (search.trim()) {
        params.search = search.trim();
      }
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      const res = await API.get("/assessments/templates/", { params });
      setTemplates(res.data.results || []);
      setTotalCount(res.data.count || 0);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.detail || "Failed to load templates.";
      setError(errMsg);
      showToast(errMsg, "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, ordering, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTemplates();
  }, [fetchTemplates]);

  // Handle Search & Filter resets
  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(0);
  };

  // Actions
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setSelectedTemplate(null);
    setTemplateForm({
      name: "",
      description: "",
      instructions: "",
      duration_minutes: 60,
    });
    setOpenFormModal(true);
  };

  const handleOpenEdit = useCallback(async (templateId) => {
    setIsEditMode(true);
    setLoading(true);
    try {
      const res = await API.get(`/assessments/templates/${templateId}/`);
      setSelectedTemplate(res.data);
      setTemplateForm({
        name: res.data.name,
        description: res.data.description,
        instructions: res.data.instructions,
        duration_minutes: res.data.duration_minutes,
      });
      setOpenFormModal(true);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to load template details.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!templateForm.name.trim()) return;

    setSubmittingTemplate(true);
    try {
      if (isEditMode && selectedTemplate) {
        const res = await API.patch(`/assessments/templates/${selectedTemplate.id}/`, templateForm);
        setSelectedTemplate(res.data);
        showToast("Template updated successfully.", "success");
      } else {
        const res = await API.post("/assessments/templates/", templateForm);
        setSelectedTemplate(res.data);
        setIsEditMode(true);
        showToast("Template draft created. You can now add questions.", "success");
      }
      fetchTemplates();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to save template.", "error");
    } finally {
      setSubmittingTemplate(false);
    }
  };

  const handleDeleteTemplate = useCallback((template) => {
    setConfirmConfig({
      title: "Delete Template Draft?",
      message: `Are you sure you want to permanently delete "${template.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await API.delete(`/assessments/templates/${template.id}/`);
          showToast("Template deleted successfully.", "success");
          fetchTemplates();
          setOpenConfirmModal(false);
        } catch (err) {
          console.error(err);
          showToast(err.response?.data?.detail || "Failed to delete template.", "error");
        }
      },
    });
    setOpenConfirmModal(true);
  }, [fetchTemplates, showToast]);

  const handleActivateTemplate = useCallback((template) => {
    setConfirmConfig({
      title: "Activate Assessment Template?",
      message: `Are you sure you want to activate "${template.name}"? Once activated, the template structure and questions will become immutable.`,
      onConfirm: async () => {
        try {
          await API.post(`/assessments/templates/${template.id}/activate/`);
          showToast("Template activated successfully.", "success");
          fetchTemplates();
          setOpenConfirmModal(false);
        } catch (err) {
          console.error(err);
          showToast(err.response?.data?.detail || "Failed to activate template.", "error");
        }
      },
    });
    setOpenConfirmModal(true);
  }, [fetchTemplates, showToast]);

  const handleArchiveTemplate = useCallback((template) => {
    setConfirmConfig({
      title: "Archive Assessment Template?",
      message: `Are you sure you want to archive "${template.name}"? Archived templates cannot be assigned to new candidates, but existing assessments remain valid.`,
      onConfirm: async () => {
        try {
          await API.post(`/assessments/templates/${template.id}/archive/`);
          showToast("Template archived successfully.", "success");
          fetchTemplates();
          setOpenConfirmModal(false);
        } catch (err) {
          console.error(err);
          showToast(err.response?.data?.detail || "Failed to archive template.", "error");
        }
      },
    });
    setOpenConfirmModal(true);
  }, [fetchTemplates, showToast]);

  const handleCloneTemplate = useCallback(async (template) => {
    try {
      const res = await API.post(`/assessments/templates/${template.id}/clone/`);
      showToast(`Cloned successfully as new draft Version ${res.data.version}.`, "success");
      fetchTemplates();
      handleOpenEdit(res.data.id);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to clone template.", "error");
    }
  }, [fetchTemplates, showToast, handleOpenEdit]);

  const handleOpenPreview = useCallback(async (templateId) => {
    setLoading(true);
    try {
      const res = await API.get(`/assessments/templates/${templateId}/preview/`);
      setSelectedTemplate(res.data);
      setOpenPreviewModal(true);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to load candidate preview.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Question Management Actions
  const handleOpenAddQuestion = () => {
    setSelectedQuestion(null);
    setQuestionForm({
      title: "",
      prompt: "",
      marks: 10,
      execution_mode: "function",
      function_name: "",
      starter_code_per_language: { python: "def function_name(args):\n    # Write your code here\n    pass\n" },
      visible_test_cases: [{ input: "", expected_output: "", explanation: "", order: 1 }],
      hidden_test_cases: [{ input: "", expected_output: "", explanation: "", order: 1 }],
      hidden_tests: "",
    });
    setOpenQuestionModal(true);
  };

  const handleOpenEditQuestion = (q) => {
    setSelectedQuestion(q);
    let starter_code_per_language = q.starter_code_per_language || {};
    if (Object.keys(starter_code_per_language).length === 0) {
      const lang = q.language || "python";
      starter_code_per_language = { [lang]: q.starter_code || "" };
    }
    setQuestionForm({
      title: q.title,
      prompt: q.prompt,
      marks: q.marks,
      execution_mode: q.execution_mode || "function",
      function_name: q.function_name || "",
      starter_code_per_language: starter_code_per_language,
      visible_test_cases: q.visible_test_cases && q.visible_test_cases.length > 0
        ? q.visible_test_cases.map((tc, idx) => ({ ...tc, order: tc.order || idx + 1 }))
        : [{ input: "", expected_output: "", explanation: "", order: 1 }],
      hidden_test_cases: q.hidden_test_cases && q.hidden_test_cases.length > 0
        ? q.hidden_test_cases.map((tc, idx) => ({ ...tc, order: tc.order || idx + 1 }))
        : [{ input: "", expected_output: "", explanation: "", order: 1 }],
      hidden_tests: q.hidden_tests || "",
    });
    setOpenQuestionModal(true);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    if (questionForm.execution_mode === "function" && !questionForm.function_name.trim()) {
      showToast("Function name is required in function mode.", "error");
      return;
    }

    // 1. Validate visible test cases JSON
    for (let i = 0; i < questionForm.visible_test_cases.length; i++) {
      const tc = questionForm.visible_test_cases[i];
      if (!tc.input.trim() || !tc.expected_output.trim()) {
        showToast(`Visible test case at index ${i + 1} cannot have empty input or expected output.`, "error");
        return;
      }
      try {
        const parsedInput = JSON.parse(tc.input);
        if (questionForm.execution_mode === "function" && !Array.isArray(parsedInput)) {
          showToast(`Visible test case ${i + 1} input must be a JSON array of arguments (e.g. ["arg1"] or [[1, 2]]).`, "error");
          return;
        }
      } catch {
        showToast(`Visible test case ${i + 1} input is not valid JSON.`, "error");
        return;
      }
      try {
        JSON.parse(tc.expected_output);
      } catch {
        showToast(`Visible test case ${i + 1} expected output is not valid JSON.`, "error");
        return;
      }
    }

    // 2. Validate hidden test cases JSON
    for (let i = 0; i < questionForm.hidden_test_cases.length; i++) {
      const tc = questionForm.hidden_test_cases[i];
      if (!tc.input.trim() || !tc.expected_output.trim()) {
        showToast(`Hidden test case at index ${i + 1} cannot have empty input or expected output.`, "error");
        return;
      }
      try {
        const parsedInput = JSON.parse(tc.input);
        if (questionForm.execution_mode === "function" && !Array.isArray(parsedInput)) {
          showToast(`Hidden test case ${i + 1} input must be a JSON array of arguments (e.g. ["arg1"] or [[1, 2]]).`, "error");
          return;
        }
      } catch {
        showToast(`Hidden test case ${i + 1} input is not valid JSON.`, "error");
        return;
      }
      try {
        JSON.parse(tc.expected_output);
      } catch {
        showToast(`Hidden test case ${i + 1} expected output is not valid JSON.`, "error");
        return;
      }
    }

    // 3. Validate starter code
    const langs = Object.keys(questionForm.starter_code_per_language);
    if (langs.length === 0) {
      showToast("At least one language must be enabled with starter code.", "error");
      return;
    }
    for (const lang of langs) {
      if (!questionForm.starter_code_per_language[lang]?.trim()) {
        showToast(`Starter code for ${lang} cannot be empty.`, "error");
        return;
      }
    }

    setSubmittingQuestion(true);
    try {
      const payload = {
        title: questionForm.title,
        prompt: questionForm.prompt,
        marks: questionForm.marks,
        execution_mode: questionForm.execution_mode,
        function_name: questionForm.function_name,
        starter_code_per_language: questionForm.starter_code_per_language,
        visible_test_cases: questionForm.visible_test_cases.map((tc, idx) => ({
          input: tc.input,
          expected_output: tc.expected_output,
          explanation: tc.explanation || "",
          order: idx + 1,
        })),
        hidden_test_cases: questionForm.hidden_test_cases.map((tc, idx) => ({
          input: tc.input,
          expected_output: tc.expected_output,
          explanation: tc.explanation || "",
          order: idx + 1,
        })),
        starter_code: questionForm.starter_code_per_language.python || "",
        language: "python",
      };

      if (selectedQuestion) {
        if (questionForm.hidden_tests && questionForm.hidden_tests.trim()) {
          payload.hidden_tests = questionForm.hidden_tests;
        }
        await API.patch(
          `/assessments/templates/${selectedTemplate.id}/questions/${selectedQuestion.id}/`,
          payload
        );
        showToast("Question updated.", "success");
      } else {
        const order = selectedTemplate.questions?.length || 0;
        payload.display_order = order;
        await API.post(
          `/assessments/templates/${selectedTemplate.id}/questions/`,
          payload
        );
        showToast("Question added.", "success");
      }
      setOpenQuestionModal(false);
      const res = await API.get(`/assessments/templates/${selectedTemplate.id}/`);
      setSelectedTemplate(res.data);
      fetchTemplates();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to save question.", "error");
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!selectedTemplate) return;
    try {
      await API.delete(`/assessments/templates/${selectedTemplate.id}/questions/${qId}/`);
      showToast("Question deleted.", "success");
      // Reload template detail
      const res = await API.get(`/assessments/templates/${selectedTemplate.id}/`);
      setSelectedTemplate(res.data);
      fetchTemplates();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to delete question.", "error");
    }
  };

  const handleMoveQuestion = async (index, direction) => {
    if (!selectedTemplate) return;
    const questions = [...(selectedTemplate.questions || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    // Swap elements
    const temp = questions[index];
    questions[index] = questions[targetIndex];
    questions[targetIndex] = temp;

    // Build payload of new orders
    const payload = questions.map((q, idx) => ({
      id: q.id,
      display_order: idx,
    }));

    try {
      await API.post(`/assessments/templates/${selectedTemplate.id}/questions/reorder/`, payload);
      // Reload template detail
      const res = await API.get(`/assessments/templates/${selectedTemplate.id}/`);
      setSelectedTemplate(res.data);
      showToast("Question order updated.", "success");
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to reorder questions.", "error");
    }
  };

  // DataGrid Columns Definition
  const columns = useMemo(() => [
    { field: "name", headerName: "Template Name", minWidth: 200, flex: 1 },
    { field: "version", headerName: "Version", width: 90, align: "center" },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: (params) => {
        const val = params.value || "draft";
        return (
          <span
            className={`badge text-capitalize mt-2 px-2 py-1`}
            style={{
              fontSize: "0.75rem",
              backgroundColor:
                val === "active"
                  ? "rgba(16, 185, 129, 0.15)"
                  : val === "archived"
                  ? "rgba(245, 158, 11, 0.15)"
                  : "rgba(100, 116, 139, 0.15)",
              color:
                val === "active"
                  ? "#10b981"
                  : val === "archived"
                  ? "#f59e0b"
                  : "#94a3b8",
              border: `1px solid ${
                val === "active"
                  ? "#10b981"
                  : val === "archived"
                  ? "#f59e0b"
                  : "#94a3b8"
              }`,
            }}
          >
            {val}
          </span>
        );
      },
    },
    { field: "duration_minutes", headerName: "Duration (min)", width: 120, align: "center" },
    { field: "question_count", headerName: "Questions", width: 110, align: "center" },
    { field: "total_marks", headerName: "Total Marks", width: 110, align: "center" },
    {
      field: "updated_at",
      headerName: "Updated",
      width: 150,
      valueFormatter: (value) => {
        if (!value) return "";
        return new Date(value).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      },
    },
    {
      field: "actions",
      type: "actions",
      headerName: "Actions",
      width: 220,
      getActions: (params) => {
        const row = params.row;
        const isDraft = row.status === "draft";
        const isActive = row.status === "active";

        return [
          <GridActionsCellItem
            icon={<VisibilityIcon style={{ color: "#94a3b8" }} />}
            label="Preview"
            onClick={() => handleOpenPreview(row.id)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<EditIcon style={{ color: isDraft ? "#6366f1" : "#475569" }} />}
            label="Edit"
            disabled={!isDraft}
            onClick={() => handleOpenEdit(row.id)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<PlayIcon style={{ color: isDraft ? "#10b981" : "#475569" }} />}
            label="Activate"
            disabled={!isDraft}
            onClick={() => handleActivateTemplate(row)}
            showInMenu={false}
          />,
          <GridActionsCellItem
            icon={<CloneIcon style={{ color: "#6366f1" }} />}
            label="Clone Version"
            onClick={() => handleCloneTemplate(row)}
            showInMenu={true}
          />,
          <GridActionsCellItem
            icon={<ArchiveIcon style={{ color: isActive ? "#f59e0b" : "#475569" }} />}
            label="Archive"
            disabled={!isActive}
            onClick={() => handleArchiveTemplate(row)}
            showInMenu={true}
          />,
          <GridActionsCellItem
            icon={<DeleteIcon style={{ color: isDraft ? "#f05d5e" : "#475569" }} />}
            label="Delete"
            disabled={!isDraft}
            onClick={() => handleDeleteTemplate(row)}
            showInMenu={true}
          />,
        ];
      },
    },
  ], [handleOpenPreview, handleOpenEdit, handleActivateTemplate, handleCloneTemplate, handleArchiveTemplate, handleDeleteTemplate]);

  return (
    <div className="d-flex flex-column gap-3 w-100 text-white" style={{ minHeight: "80vh" }}>
      {error && <div className="alert alert-danger p-3 mb-2">{error}</div>}
      {/* Header and Add Action */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <div>
          <h2 className="fw-bold text-white mb-1">Assessment Templates</h2>
          <p className="text-secondary small mb-0">Create, manage and version Python notebook assessments.</p>
        </div>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          style={{ backgroundColor: "#6366f1", textTransform: "none", fontWeight: "bold" }}
          className="fw-bold px-3 py-2"
        >
          Create Template
        </Button>
      </div>

      {/* Filters Toolbar */}
      <Paper
        className="p-3 d-flex flex-wrap gap-3 align-items-center border border-secondary"
        style={{ backgroundColor: "#1e293b", borderColor: "#475569" }}
      >
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: "250px" }}>
          <SearchIcon style={{ color: "#94a3b8" }} />
          <TextField
            placeholder="Search templates name/desc..."
            variant="standard"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            fullWidth
            InputProps={{
              disableUnderline: true,
              style: { color: "#f8fafc", fontSize: "0.9rem" },
            }}
          />
        </div>

        <FormControl size="small" style={{ minWidth: "150px" }}>
          <InputLabel id="status-filter-label" style={{ color: "#cbd5e1" }}>Status</InputLabel>
          <Select
            labelId="status-filter-label"
            value={statusFilter}
            label="Status"
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            style={{
              color: "#f8fafc",
              backgroundColor: "#0f172a",
              borderColor: "#475569",
            }}
          >
            <MenuItem value="all">All Statuses</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="archived">Archived</MenuItem>
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          startIcon={<ClearIcon />}
          onClick={handleClearFilters}
          style={{ borderColor: "#475569", color: "#cbd5e1", textTransform: "none" }}
          disabled={!search && statusFilter === "all"}
        >
          Clear Filters
        </Button>

        <div className="ms-auto text-secondary small">
          Results: <strong className="text-white">{totalCount}</strong>
        </div>
      </Paper>

      {/* Templates Directory Table */}
      <div style={{ width: "100%", height: "450px", backgroundColor: "#0f172a" }}>
        <DataGrid
          rows={templates}
          columns={columns}
          loading={loading}
          paginationMode="server"
          rowCount={totalCount}
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          sortingMode="server"
          onSortModelChange={(model) => {
            if (model.length > 0) {
              const sortField = model[0].field;
              const isDesc = model[0].sort === "desc";
              setOrdering(isDesc ? `-${sortField}` : sortField);
            } else {
              setOrdering("-updated_at");
            }
          }}
          pageSizeOptions={[5, 10, 20, 50]}
          disableRowSelectionOnClick
          sx={{
            border: "1px solid #334155",
            color: "#f8fafc",
            "& .MuiDataGrid-main": {
              backgroundColor: "#0f172a",
            },
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#1e293b",
              color: "#cbd5e1",
              borderBottom: "1px solid #334155",
            },
            "& .MuiDataGrid-cell": {
              borderBottom: "1px solid #1e293b",
            },
            "& .MuiDataGrid-footerContainer": {
              backgroundColor: "#1e293b",
              borderTop: "1px solid #334155",
              color: "#f8fafc",
            },
            "& .MuiTablePagination-root": {
              color: "#cbd5e1",
            },
            "& .MuiIconButton-root": {
              color: "#94a3b8",
            },
          }}
        />
      </div>

      {/* --- FORM DIALOG (CREATE / EDIT TEMPLATE) --- */}
      <Dialog
        open={openFormModal}
        onClose={() => setOpenFormModal(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          style: {
            backgroundColor: "#1e293b",
            color: "#f8fafc",
            border: "1px solid #475569",
          },
        }}
      >
        <DialogTitle style={{ borderBottom: "1px solid #334155" }} className="fw-bold">
          {isEditMode ? `Edit Template: ${templateForm.name}` : "Create Assessment Template"}
        </DialogTitle>
        <DialogContent className="py-4">
          <form onSubmit={handleSaveTemplate} className="d-flex flex-column gap-3 mb-4">
            <div className="row g-3">
              <div className="col-md-8">
                <TextField
                  label="Template Name"
                  fullWidth
                  required
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  variant="outlined"
                  InputLabelProps={{ style: { color: "#cbd5e1" } }}
                  inputProps={{ style: { color: "#f8fafc" } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { borderColor: "#475569" },
                      "&:hover fieldset": { borderColor: "#6366f1" },
                    },
                  }}
                />
              </div>
              <div className="col-md-4">
                <TextField
                  label="Duration (Minutes)"
                  type="number"
                  fullWidth
                  required
                  value={templateForm.duration_minutes}
                  onChange={(e) =>
                    setTemplateForm({
                      ...templateForm,
                      duration_minutes: parseInt(e.target.value) || 0,
                    })
                  }
                  variant="outlined"
                  InputLabelProps={{ style: { color: "#cbd5e1" } }}
                  inputProps={{ style: { color: "#f8fafc", min: 1 } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { borderColor: "#475569" },
                      "&:hover fieldset": { borderColor: "#6366f1" },
                    },
                  }}
                />
              </div>
            </div>

            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={templateForm.description}
              onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
              variant="outlined"
              InputLabelProps={{ style: { color: "#cbd5e1" } }}
              inputProps={{ style: { color: "#f8fafc" } }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#475569" },
                  "&:hover fieldset": { borderColor: "#6366f1" },
                },
              }}
            />

            <TextField
              label="Candidate Instructions"
              fullWidth
              multiline
              rows={3}
              value={templateForm.instructions}
              onChange={(e) => setTemplateForm({ ...templateForm, instructions: e.target.value })}
              variant="outlined"
              InputLabelProps={{ style: { color: "#cbd5e1" } }}
              inputProps={{ style: { color: "#f8fafc" } }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#475569" },
                  "&:hover fieldset": { borderColor: "#6366f1" },
                },
              }}
            />

            <div className="d-flex justify-content-end">
              <Button
                type="submit"
                variant="contained"
                disabled={submittingTemplate}
                style={{ backgroundColor: "#6366f1", textTransform: "none", fontWeight: "bold" }}
              >
                {submittingTemplate ? <CircularProgress size={20} color="inherit" /> : "Save Template Fields"}
              </Button>
            </div>
          </form>

          {/* QUESTIONS SECTION (ONLY IN EDIT MODE FOR DRAFTS) */}
          {isEditMode && selectedTemplate && (
            <div className="border-top pt-4" style={{ borderColor: "#334155" }}>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="fw-bold mb-0">Questions Manager</h4>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleOpenAddQuestion}
                  style={{ color: "#6366f1", borderColor: "#6366f1", textTransform: "none" }}
                >
                  Add Question
                </Button>
              </div>

              {selectedTemplate.questions?.length === 0 ? (
                <div
                  className="p-4 text-center text-secondary rounded border border-dashed"
                  style={{ borderColor: "#475569", borderStyle: "dashed" }}
                >
                  No questions created yet. Add at least one question to this draft.
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {(selectedTemplate.questions || []).map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-3 rounded border d-flex justify-content-between align-items-center"
                      style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                    >
                      <div className="d-flex align-items-center gap-3">
                        {/* Reordering Controls */}
                        <div className="d-flex flex-column gap-1">
                          <IconButton
                            size="small"
                            onClick={() => handleMoveQuestion(idx, -1)}
                            disabled={idx === 0}
                            style={{ color: idx === 0 ? "#475569" : "#cbd5e1" }}
                          >
                            <ArrowUpIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleMoveQuestion(idx, 1)}
                            disabled={idx === (selectedTemplate.questions?.length || 1) - 1}
                            style={{
                              color:
                                idx === (selectedTemplate.questions?.length || 1) - 1
                                  ? "#475569"
                                  : "#cbd5e1",
                            }}
                          >
                            <ArrowDownIcon fontSize="small" />
                          </IconButton>
                        </div>

                        <div>
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-secondary">Q{idx + 1}</span>
                            <h5 className="mb-0 fw-bold">{q.title}</h5>
                            <span className="text-secondary small">({q.language || "python"})</span>
                          </div>
                          <p className="text-secondary small mb-0 mt-1" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "450px" }}>
                            {q.prompt}
                          </p>
                        </div>
                      </div>

                      <div className="d-flex align-items-center gap-3">
                        <div className="text-end">
                          <div className="fw-bold" style={{ color: "#cbd5e1" }}>
                            {q.marks} Marks
                          </div>
                          <span className="text-secondary small">
                            {q.has_hidden_tests ? "Tests Configured" : "No Tests"}
                          </span>
                        </div>

                        <IconButton onClick={() => handleOpenEditQuestion(q)} style={{ color: "#6366f1" }}>
                          <EditIcon />
                        </IconButton>

                        <IconButton onClick={() => handleDeleteQuestion(q.id)} style={{ color: "#f05d5e" }}>
                          <DeleteIcon />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
        <DialogActions style={{ borderTop: "1px solid #334155" }} className="px-4 py-3">
          <Button onClick={() => setOpenFormModal(false)} style={{ color: "#cbd5e1" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- ADD / EDIT QUESTION DIALOG --- */}
      <Dialog
        open={openQuestionModal}
        onClose={() => setOpenQuestionModal(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          style: {
            backgroundColor: "#1e293b",
            color: "#f8fafc",
            border: "1px solid #475569",
          },
        }}
      >
        <DialogTitle style={{ borderBottom: "1px solid #334155" }}>
          {selectedQuestion ? "Edit Question" : "Add Question"}
        </DialogTitle>
        <form onSubmit={handleSaveQuestion}>
          <DialogContent className="py-4 d-flex flex-column gap-3">
            <div className="row g-3">
              <div className="col-md-8">
                <TextField
                  label="Question Title"
                  fullWidth
                  required
                  value={questionForm.title}
                  onChange={(e) => setQuestionForm({ ...questionForm, title: e.target.value })}
                  variant="outlined"
                  InputLabelProps={{ style: { color: "#cbd5e1" } }}
                  inputProps={{ style: { color: "#f8fafc" } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { borderColor: "#475569" },
                      "&:hover fieldset": { borderColor: "#6366f1" },
                    },
                  }}
                />
              </div>
              <div className="col-md-4">
                <TextField
                  label="Marks"
                  type="number"
                  fullWidth
                  required
                  value={questionForm.marks}
                  onChange={(e) =>
                    setQuestionForm({
                      ...questionForm,
                      marks: parseInt(e.target.value) || 0,
                    })
                  }
                  variant="outlined"
                  InputLabelProps={{ style: { color: "#cbd5e1" } }}
                  inputProps={{ style: { color: "#f8fafc", min: 1 } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { borderColor: "#475569" },
                      "&:hover fieldset": { borderColor: "#6366f1" },
                    },
                  }}
                />
              </div>
            </div>

            <TextField
              label="Question Prompt / Problem Description"
              fullWidth
              required
              multiline
              rows={4}
              value={questionForm.prompt}
              onChange={(e) => setQuestionForm({ ...questionForm, prompt: e.target.value })}
              variant="outlined"
              InputLabelProps={{ style: { color: "#cbd5e1" } }}
              inputProps={{ style: { color: "#f8fafc" } }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#475569" },
                  "&:hover fieldset": { borderColor: "#6366f1" },
                },
              }}
            />

            <div className="row g-3">
              <div className="col-md-6">
                <FormControl fullWidth sx={{
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": { borderColor: "#475569" },
                    "&:hover fieldset": { borderColor: "#6366f1" },
                  },
                }}>
                  <InputLabel id="execution-mode-label" style={{ color: "#cbd5e1" }}>Execution Mode</InputLabel>
                  <Select
                    labelId="execution-mode-label"
                    value={questionForm.execution_mode}
                    label="Execution Mode"
                    onChange={(e) => setQuestionForm({ ...questionForm, execution_mode: e.target.value })}
                    style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}
                  >
                    <MenuItem value="function">Function Call</MenuItem>
                    <MenuItem value="stdio">Standard Input/Output (Not Supported)</MenuItem>
                  </Select>
                </FormControl>
              </div>
              <div className="col-md-6">
                {questionForm.execution_mode === "function" && (
                  <TextField
                    label="Function Name"
                    fullWidth
                    required
                    value={questionForm.function_name}
                    onChange={(e) => setQuestionForm({ ...questionForm, function_name: e.target.value })}
                    variant="outlined"
                    placeholder="e.g. count_evens"
                    InputLabelProps={{ style: { color: "#cbd5e1" } }}
                    inputProps={{ style: { color: "#f8fafc" } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "& fieldset": { borderColor: "#475569" },
                        "&:hover fieldset": { borderColor: "#6366f1" },
                      },
                    }}
                  />
                )}
              </div>
            </div>

            <div className="p-3 rounded border" style={{ borderColor: "#334155", backgroundColor: "rgba(30, 41, 59, 0.5)" }}>
              <h6 className="fw-bold mb-2">Starter Code Skeletons</h6>
              <p className="text-secondary small mb-3">
                Provide a clean function skeleton for each supported language. <strong>Never include the solution.</strong>
              </p>
              <div className="d-flex gap-4 mb-3">
                <label className="d-flex align-items-center gap-2" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!questionForm.starter_code_per_language.python || questionForm.starter_code_per_language.python === ""}
                    onChange={(e) => {
                      const copy = { ...questionForm.starter_code_per_language };
                      if (e.target.checked) {
                        copy.python = `def ${questionForm.function_name || "solution"}(args):\n    # Write your code here\n    pass\n`;
                      } else {
                        delete copy.python;
                      }
                      setQuestionForm({ ...questionForm, starter_code_per_language: copy });
                    }}
                  />
                  <span>Python 3</span>
                </label>
                <label className="d-flex align-items-center gap-2" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!questionForm.starter_code_per_language.javascript || questionForm.starter_code_per_language.javascript === ""}
                    onChange={(e) => {
                      const copy = { ...questionForm.starter_code_per_language };
                      if (e.target.checked) {
                        copy.javascript = `function ${questionForm.function_name || "solution"}(args) {\n    // Write your code here\n}\n`;
                      } else {
                        delete copy.javascript;
                      }
                      setQuestionForm({ ...questionForm, starter_code_per_language: copy });
                    }}
                  />
                  <span>JavaScript (Node)</span>
                </label>
              </div>

              {Object.keys(questionForm.starter_code_per_language).map((lang) => (
                <div key={lang} className="mb-3">
                  <TextField
                    label={`Starter Code (${lang === "python" ? "Python 3" : "JavaScript"})`}
                    fullWidth
                    multiline
                    rows={4}
                    required
                    value={questionForm.starter_code_per_language[lang]}
                    onChange={(e) => {
                      const copy = { ...questionForm.starter_code_per_language };
                      copy[lang] = e.target.value;
                      setQuestionForm({ ...questionForm, starter_code_per_language: copy });
                    }}
                    variant="outlined"
                    InputLabelProps={{ style: { color: "#cbd5e1" } }}
                    inputProps={{ style: { color: "#f8fafc", style: { fontFamily: "monospace" } } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "& fieldset": { borderColor: "#475569" },
                        "&:hover fieldset": { borderColor: "#6366f1" },
                      },
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="p-3 rounded border" style={{ borderColor: "#334155", backgroundColor: "rgba(30, 41, 59, 0.5)" }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="fw-bold mb-0">Visible Sample Test Cases</h6>
                <Button
                  size="small"
                  onClick={() => {
                    setQuestionForm({
                      ...questionForm,
                      visible_test_cases: [
                        ...questionForm.visible_test_cases,
                        { input: "", expected_output: "", explanation: "", order: questionForm.visible_test_cases.length + 1 }
                      ]
                    });
                  }}
                  style={{ color: "#6366f1", textTransform: "none" }}
                >
                  + Add Sample Case
                </Button>
              </div>
              <p className="text-secondary small mb-3">
                Exposed to candidates. In function mode, input must be a JSON array of arguments, e.g. <code>["hello"]</code> or <code>[[1, 2]]</code>. Expected output must be valid JSON, e.g. <code>"world"</code> or <code>3</code>.
              </p>

              {questionForm.visible_test_cases.map((tc, idx) => (
                <div key={idx} className="p-3 mb-3 rounded" style={{ backgroundColor: "#0f172a", border: "1px solid #334155" }}>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="badge bg-primary">Sample Case #{idx + 1}</span>
                    {questionForm.visible_test_cases.length > 1 && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => {
                          const copy = questionForm.visible_test_cases.filter((_, i) => i !== idx)
                            .map((item, i) => ({ ...item, order: i + 1 }));
                          setQuestionForm({ ...questionForm, visible_test_cases: copy });
                        }}
                        style={{ textTransform: "none" }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-md-6">
                      <TextField
                        label="Input (JSON Array)"
                        fullWidth
                        required
                        placeholder='e.g. ["hello"] or [[1, 2]]'
                        value={tc.input}
                        onChange={(e) => {
                          const copy = [...questionForm.visible_test_cases];
                          copy[idx].input = e.target.value;
                          setQuestionForm({ ...questionForm, visible_test_cases: copy });
                        }}
                        variant="outlined"
                        InputLabelProps={{ style: { color: "#cbd5e1" } }}
                        inputProps={{ style: { color: "#f8fafc", style: { fontFamily: "monospace" } } }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            "& fieldset": { borderColor: "#475569" },
                          },
                        }}
                      />
                    </div>
                    <div className="col-md-6">
                      <TextField
                        label="Expected Output (JSON)"
                        fullWidth
                        required
                        placeholder='e.g. "world" or 3'
                        value={tc.expected_output}
                        onChange={(e) => {
                          const copy = [...questionForm.visible_test_cases];
                          copy[idx].expected_output = e.target.value;
                          setQuestionForm({ ...questionForm, visible_test_cases: copy });
                        }}
                        variant="outlined"
                        InputLabelProps={{ style: { color: "#cbd5e1" } }}
                        inputProps={{ style: { color: "#f8fafc", style: { fontFamily: "monospace" } } }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            "& fieldset": { borderColor: "#475569" },
                          },
                        }}
                      />
                    </div>
                  </div>
                  <TextField
                    label="Explanation (Optional)"
                    fullWidth
                    placeholder="Explain why this input produces this output"
                    value={tc.explanation || ""}
                    onChange={(e) => {
                      const copy = [...questionForm.visible_test_cases];
                      copy[idx].explanation = e.target.value;
                      setQuestionForm({ ...questionForm, visible_test_cases: copy });
                    }}
                    variant="outlined"
                    InputLabelProps={{ style: { color: "#cbd5e1" } }}
                    inputProps={{ style: { color: "#f8fafc" } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "& fieldset": { borderColor: "#475569" },
                      },
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="p-3 rounded border border-warning" style={{ backgroundColor: "rgba(245, 158, 11, 0.03)" }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="fw-bold text-warning mb-0">Private Grading Tests — never exposed to candidates.</h6>
                <Button
                  size="small"
                  onClick={() => {
                    setQuestionForm({
                      ...questionForm,
                      hidden_test_cases: [
                        ...questionForm.hidden_test_cases,
                        { input: "", expected_output: "", explanation: "", order: questionForm.hidden_test_cases.length + 1 }
                      ]
                    });
                  }}
                  style={{ color: "#f59e0b", textTransform: "none" }}
                >
                  + Add Private Case
                </Button>
              </div>
              <p className="text-secondary small mb-3">
                Used strictly for final evaluation. Same input/output rules apply.
              </p>

              {questionForm.hidden_test_cases.map((tc, idx) => (
                <div key={idx} className="p-3 mb-3 rounded" style={{ backgroundColor: "#0f172a", border: "1px solid #475569" }}>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="badge bg-warning text-dark">Private Case #{idx + 1}</span>
                    {questionForm.hidden_test_cases.length > 1 && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => {
                          const copy = questionForm.hidden_test_cases.filter((_, i) => i !== idx)
                            .map((item, i) => ({ ...item, order: i + 1 }));
                          setQuestionForm({ ...questionForm, hidden_test_cases: copy });
                        }}
                        style={{ textTransform: "none" }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-md-6">
                      <TextField
                        label="Input (JSON Array)"
                        fullWidth
                        required
                        placeholder='e.g. ["hello"] or [[1, 2]]'
                        value={tc.input}
                        onChange={(e) => {
                          const copy = [...questionForm.hidden_test_cases];
                          copy[idx].input = e.target.value;
                          setQuestionForm({ ...questionForm, hidden_test_cases: copy });
                        }}
                        variant="outlined"
                        InputLabelProps={{ style: { color: "#cbd5e1" } }}
                        inputProps={{ style: { color: "#f8fafc", style: { fontFamily: "monospace" } } }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            "& fieldset": { borderColor: "#475569" },
                          },
                        }}
                      />
                    </div>
                    <div className="col-md-6">
                      <TextField
                        label="Expected Output (JSON)"
                        fullWidth
                        required
                        placeholder='e.g. "world" or 3'
                        value={tc.expected_output}
                        onChange={(e) => {
                          const copy = [...questionForm.hidden_test_cases];
                          copy[idx].expected_output = e.target.value;
                          setQuestionForm({ ...questionForm, hidden_test_cases: copy });
                        }}
                        variant="outlined"
                        InputLabelProps={{ style: { color: "#cbd5e1" } }}
                        inputProps={{ style: { color: "#f8fafc", style: { fontFamily: "monospace" } } }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            "& fieldset": { borderColor: "#475569" },
                          },
                        }}
                      />
                    </div>
                  </div>
                  <TextField
                    label="Explanation (Optional)"
                    fullWidth
                    placeholder="Explanation"
                    value={tc.explanation || ""}
                    onChange={(e) => {
                      const copy = [...questionForm.hidden_test_cases];
                      copy[idx].explanation = e.target.value;
                      setQuestionForm({ ...questionForm, hidden_test_cases: copy });
                    }}
                    variant="outlined"
                    InputLabelProps={{ style: { color: "#cbd5e1" } }}
                    inputProps={{ style: { color: "#f8fafc" } }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "& fieldset": { borderColor: "#475569" },
                      },
                    }}
                  />
                </div>
              ))}
            </div>

            {questionForm.hidden_tests && (
              <div className="p-3 rounded border border-warning" style={{ backgroundColor: "rgba(245, 158, 11, 0.05)" }}>
                <h6 className="fw-bold text-warning mb-1">Legacy Hidden Tests (Read-Only/Backup)</h6>
                <TextField
                  label="Legacy Tests block"
                  fullWidth
                  multiline
                  disabled
                  rows={3}
                  value={questionForm.hidden_tests}
                  variant="outlined"
                  InputLabelProps={{ style: { color: "#cbd5e1" } }}
                  inputProps={{ style: { color: "#cbd5e1", style: { fontFamily: "monospace" } } }}
                />
              </div>
            )}
          </DialogContent>
          <DialogActions style={{ borderTop: "1px solid #334155" }} className="px-4 py-3">
            <Button onClick={() => setOpenQuestionModal(false)} style={{ color: "#cbd5e1" }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submittingQuestion}
              style={{ backgroundColor: "#6366f1", textTransform: "none", fontWeight: "bold" }}
            >
              {submittingQuestion ? <CircularProgress size={20} color="inherit" /> : "Save Question"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* --- CANDIDATE PREVIEW DIALOG --- */}
      <Dialog
        open={openPreviewModal}
        onClose={() => setOpenPreviewModal(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          style: {
            backgroundColor: "#0f172a",
            color: "#f8fafc",
            border: "1px solid #334155",
          },
        }}
      >
        <DialogTitle style={{ borderBottom: "1px solid #334155" }} className="fw-bold text-center">
          <span className="badge bg-success px-3 py-2">CANDIDATE PREVIEW</span>
        </DialogTitle>
        {selectedTemplate && (
          <DialogContent className="py-4">
            <div className="mb-4">
              <h3 className="fw-bold mb-1">{selectedTemplate.name}</h3>
              <div className="d-flex gap-3 text-secondary small flex-wrap mt-2">
                <span>Duration: <strong className="text-white">{selectedTemplate.duration_minutes} Minutes</strong></span>
                <span>•</span>
                <span>Total Marks: <strong className="text-white">{selectedTemplate.total_marks} Marks</strong></span>
                <span>•</span>
                <span>Version: <strong className="text-white">v{selectedTemplate.version}</strong></span>
              </div>
            </div>

            {selectedTemplate.description && (
              <div className="mb-4 p-3 rounded" style={{ backgroundColor: "#1e293b" }}>
                <strong className="text-secondary small d-block mb-1">About the Assessment</strong>
                <p className="mb-0 small">{selectedTemplate.description}</p>
              </div>
            )}

            {selectedTemplate.instructions && (
              <div className="mb-4 p-3 rounded" style={{ backgroundColor: "#1e293b" }}>
                <strong className="text-secondary small d-block mb-1">Instructions for Candidates</strong>
                <p className="mb-0 small" style={{ whiteSpace: "pre-line" }}>{selectedTemplate.instructions}</p>
              </div>
            )}

            <h4 className="fw-bold mt-4 mb-3 border-bottom pb-2" style={{ borderColor: "#334155" }}>
              Questions ({selectedTemplate.questions?.length || 0})
            </h4>

            <div className="d-flex flex-column gap-4">
              {(selectedTemplate.questions || []).map((q, idx) => (
                <div key={q.id} className="p-3 rounded border" style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}>
                  <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <h5 className="fw-bold mb-0">Question {idx + 1}: {q.title}</h5>
                    <span className="badge bg-secondary">{q.marks} Marks</span>
                  </div>

                  <p className="small mb-3 mt-2 text-light" style={{ whiteSpace: "pre-line" }}>
                    {q.prompt}
                  </p>

                  {q.starter_code && (
                    <div>
                      <strong className="text-secondary small d-block mb-1">Starter Code ({q.language}):</strong>
                      <pre className="p-3 rounded text-success small mb-0" style={{ backgroundColor: "#0f172a", fontFamily: "monospace", overflowX: "auto" }}>
                        {q.starter_code}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        )}
        <DialogActions style={{ borderTop: "1px solid #334155" }} className="px-4 py-3">
          <Button onClick={() => setOpenPreviewModal(false)} variant="contained" style={{ backgroundColor: "#6366f1" }}>
            Close Preview
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- CONFIRMATION DIALOG --- */}
      <Dialog
        open={openConfirmModal}
        onClose={() => setOpenConfirmModal(false)}
        PaperProps={{
          style: {
            backgroundColor: "#1e293b",
            color: "#f8fafc",
            border: "1px solid #475569",
          },
        }}
      >
        <DialogTitle className="fw-bold">{confirmConfig.title}</DialogTitle>
        <DialogContent>
          <p className="mb-0 text-secondary">{confirmConfig.message}</p>
        </DialogContent>
        <DialogActions className="px-3 py-2">
          <Button onClick={() => setOpenConfirmModal(false)} style={{ color: "#cbd5e1" }}>
            Cancel
          </Button>
          <Button
            onClick={confirmConfig.onConfirm}
            variant="contained"
            style={{ backgroundColor: "#f05d5e" }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
