import API from "./axiosConfig";

export const sendAssessment = async (applicationId, templateId, deadline) => {
  const response = await API.post("/assessments/assignments/send/", {
    application_id: applicationId,
    template_id: templateId,
    deadline: deadline,
  });
  return response.data;
};

export const getAssignmentDetails = async (assignmentId) => {
  const response = await API.get(`/assessments/assignments/${assignmentId}/`);
  return response.data;
};

export const queueAssessment = async (assignmentId) => {
  const response = await API.post(`/assessments/assignments/${assignmentId}/queue/`);
  return response.data;
};

export const retryAssessment = async (assignmentId) => {
  const response = await API.post(`/assessments/assignments/${assignmentId}/retry/`);
  return response.data;
};

export const getAssessmentResult = async (assignmentId) => {
  const response = await API.get(`/assessments/assignments/${assignmentId}/result/`);
  return response.data;
};

export const resendAssessment = async (assignmentId, deadline = null) => {
  const payload = {};
  if (deadline) {
    payload.deadline = deadline;
  }
  const response = await API.post(`/assessments/assignments/${assignmentId}/resend/`, payload);
  return response.data;
};

export const getAssignmentsForApplication = async (applicationId) => {
  const response = await API.get(`/assessments/applications/${applicationId}/assignments/`);
  return response.data;
};

export const getAssessmentAccess = async (token) => {
  const response = await API.get(`/assessments/access/${token}/`);
  return response.data;
};

export const downloadAssessmentNotebook = async (token) => {
  const response = await API.get(`/assessments/access/${token}/notebook/`, {
    responseType: "blob",
  });
  return response.data;
};

export const uploadAssessmentNotebook = async (token, file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await API.post(`/assessments/access/${token}/upload/`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const submitAssessment = async (token) => {
  const response = await API.post(`/assessments/access/${token}/submit/`);
  return response.data;
};

export const getDevAccessLink = async (assignmentId) => {
  const response = await API.get(`/assessments/assignments/${assignmentId}/dev-access-link/`);
  return response.data;
};

export const saveAnswers = async (token, answers) => {
  const response = await API.post(`/assessments/access/${token}/save-answers/`, {
    answers: answers,
  });
  return response.data;
};

export const runCode = async (token, code) => {
  const response = await API.post(`/assessments/access/${token}/run-code/`, {
    code: code,
  });
  return response.data;
};

/**
 * Runs candidate code against visible sample test cases only.
 * NEVER used for grading — only for real-time feedback during the assessment.
 *
 * @param {string} token - The candidate's assessment access token
 * @param {string} questionId - UUID of the question
 * @param {string} code - The candidate's source code
 * @param {string} language - "python" or "javascript"
 * @returns {Promise<{status, total, passed, failed, runtime_ms, test_results}>}
 */
export const runTestCases = async (token, questionId, code, language = "python") => {
  const response = await API.post(`/assessments/access/${token}/run-tests/`, {
    question_id: questionId,
    code: code,
    language: language,
  });
  return response.data;
};
