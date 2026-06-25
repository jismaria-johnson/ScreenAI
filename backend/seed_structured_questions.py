import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'screenai.settings')
django.setup()

from assessments.models import AssessmentQuestion, CandidateAssessment

def seed_questions():
    print("Seeding/updating structured question configurations...")
    
    # 1. Reverse Words
    q1 = AssessmentQuestion.objects.filter(title="Reverse Words").first()
    if q1:
        q1.execution_mode = "function"
        q1.function_name = "reverse_words"
        q1.visible_test_cases = [
            {
                "input": "\"I love python\"",
                "expected_output": "\"python love I\"",
                "order": 1
            },
            {
                "input": "\"ScreenAI coding test\"",
                "expected_output": "\"test coding ScreenAI\"",
                "order": 2
            }
        ]
        q1.hidden_test_cases = [
            {
                "input": "\"hello world\"",
                "expected_output": "\"world hello\"",
                "order": 1
            },
            {
                "input": "\"a b c\"",
                "expected_output": "\"c b a\"",
                "order": 2
            }
        ]
        q1.starter_code_per_language = {
            "python": "def reverse_words(text):\n    # Write your code here\n    pass\n",
            "javascript": "function reverse_words(text) {\n    // Write your code here\n}\n"
        }
        q1.save()
        print(f"Updated: {q1.title}")

    # 2. Count Even Numbers
    q2 = AssessmentQuestion.objects.filter(title="Count Even Numbers").first()
    if q2:
        q2.execution_mode = "function"
        q2.function_name = "count_evens"
        q2.visible_test_cases = [
            {
                "input": "[[1, 2, 3, 4, 5, 6]]",
                "expected_output": "3",
                "order": 1
            },
            {
                "input": "[[1, 3, 5]]",
                "expected_output": "0",
                "order": 2
            }
        ]
        q2.hidden_test_cases = [
            {
                "input": "[[]]",
                "expected_output": "0",
                "order": 1
            },
            {
                "input": "[[2, 4, 6, 8]]",
                "expected_output": "4",
                "order": 2
            }
        ]
        q2.starter_code_per_language = {
            "python": "def count_evens(values):\n    # Write your code here\n    pass\n",
            "javascript": "function count_evens(values) {\n    // Write your code here\n}\n"
        }
        q2.save()
        print(f"Updated: {q2.title}")

    # 3. Top Scoring Student
    q3 = AssessmentQuestion.objects.filter(title="Top Scoring Student").first()
    if q3:
        q3.execution_mode = "function"
        q3.function_name = "top_student"
        q3.visible_test_cases = [
            {
                "input": "[[{\"name\": \"Asha\", \"score\": 88}, {\"name\": \"Rahul\", \"score\": 92}]]",
                "expected_output": "\"Rahul\"",
                "order": 1
            },
            {
                "input": "[[{\"name\": \"Alice\", \"score\": 95}, {\"name\": \"Bob\", \"score\": 90}]]",
                "expected_output": "\"Alice\"",
                "order": 2
            }
        ]
        q3.hidden_test_cases = [
            {
                "input": "[[{\"name\": \"X\", \"score\": 50}]]",
                "expected_output": "\"X\"",
                "order": 1
            },
            {
                "input": "[[{\"name\": \"X\", \"score\": 50}, {\"name\": \"Y\", \"score\": 100}, {\"name\": \"Z\", \"score\": 75}]]",
                "expected_output": "\"Y\"",
                "order": 2
            }
        ]
        q3.starter_code_per_language = {
            "python": "def top_student(records):\n    # Write your code here\n    pass\n",
            "javascript": "function top_student(records) {\n    // Write your code here\n}\n"
        }
        q3.save()
        print(f"Updated: {q3.title}")

    # ── Update assessment snapshots in existing CandidateAssessments ────────────
    # This is critical! Existing candidate assessments must get their snapshots updated.
    for ca in CandidateAssessment.objects.all():
        snapshot = ca.assessment_snapshot
        questions = snapshot.get("questions", [])
        updated_any = False
        for q_snap in questions:
            original_q = AssessmentQuestion.objects.filter(pk=q_snap.get("id")).first()
            if original_q:
                q_snap["execution_mode"] = original_q.execution_mode
                q_snap["function_name"] = original_q.function_name
                q_snap["visible_test_cases"] = original_q.visible_test_cases
                q_snap["starter_code_per_language"] = original_q.starter_code_per_language
                updated_any = True
        
        # Also update private snapshot
        private_snapshot = ca.private_grading_snapshot
        private_questions = private_snapshot.get("questions", []) if private_snapshot else []
        for pq_snap in private_questions:
            original_q = AssessmentQuestion.objects.filter(pk=pq_snap.get("id")).first()
            if original_q:
                pq_snap["execution_mode"] = original_q.execution_mode
                pq_snap["function_name"] = original_q.function_name
                pq_snap["hidden_test_cases"] = original_q.hidden_test_cases
                updated_any = True
                
        if updated_any:
            ca.assessment_snapshot = snapshot
            if private_snapshot:
                ca.private_grading_snapshot = private_snapshot
            ca.save()
            print(f"Updated snapshot for candidate assessment: {ca.id}")

if __name__ == "__main__":
    seed_questions()
