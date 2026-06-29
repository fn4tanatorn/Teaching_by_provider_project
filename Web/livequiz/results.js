const CHOICE_IDS = ["A", "B", "C", "D", "E"];

function normalizeQuestionType(value) {
  return String(value || "mcq").trim().toLowerCase() === "short_answer" ? "short_answer" : "mcq";
}

function scoreFor(room, participantId) {
  return room.questions.reduce((total, question) => {
    if (question.state === "voided") return total;
    const answer = room.answers[question.id]?.[participantId];
    return total + (answer?.isCorrect ? 1 : 0);
  }, 0);
}

function choiceText(question, choiceId) {
  const choice = (question.choices || []).find((item) => item.id === choiceId);
  return choice ? choice.text : "";
}

function correctAnswerText(question) {
  if (normalizeQuestionType(question.questionType) === "short_answer") {
    return (question.acceptedAnswers || []).join(" | ");
  }
  const text = choiceText(question, question.correctChoiceId);
  return text ? `${question.correctChoiceId}. ${text}` : question.correctChoiceId || "";
}

function questionChoices(question) {
  return CHOICE_IDS.reduce((out, id) => {
    out[`choice_${id.toLowerCase()}`] = choiceText(question, id);
    return out;
  }, {});
}

function answered(answer) {
  return Boolean(answer?.selectedChoiceId || answer?.answerText);
}

function objectRows(headers, rows) {
  return rows.map((row) =>
    headers.reduce((out, header, index) => {
      out[header] = row[index] == null ? "" : row[index];
      return out;
    }, {})
  );
}

function buildResultExport(room) {
  const participants = room.participants.filter((participant) => !participant.kickedAt);
  const possibleScore = room.questions.filter((question) => question.state !== "voided").length;

  const summaryHeaders = [
    "room_code",
    "username",
    "total_score",
    "possible_score",
    "answered_count",
    "correct_count",
    "joined_at",
    "last_heartbeat_at",
  ];
  const summaryRows = participants.map((participant) => {
    const participantAnswers = room.questions
      .filter((question) => question.state !== "voided")
      .map((question) => room.answers[question.id]?.[participant.id]);
    const answeredCount = participantAnswers.filter(answered).length;
    const correctCount = scoreFor(room, participant.id);
    return [
      room.code,
      participant.username,
      correctCount,
      possibleScore,
      answeredCount,
      correctCount,
      participant.joinedAt || "",
      participant.lastHeartbeatAt || "",
    ];
  });

  const responseHeaders = [
    "room_code",
    "question_number",
    "question_id",
    "question_type",
    "question_state",
    "prompt",
    "participant_username",
    "answer_status",
    "selected_choice_id",
    "selected_choice_text",
    "answer_text",
    "correct_answer",
    "is_correct",
    "score",
    "submitted_at",
  ];
  const responseRows = [];
  room.questions.forEach((question, questionIndex) => {
    const questionType = normalizeQuestionType(question.questionType);
    participants.forEach((participant) => {
      const answer = room.answers[question.id]?.[participant.id] || null;
      const isVoided = question.state === "voided";
      const hasAnswer = answered(answer);
      responseRows.push([
        room.code,
        questionIndex + 1,
        question.id,
        questionType,
        question.state || "",
        question.prompt || "",
        participant.username,
        isVoided ? "voided" : hasAnswer ? "answered" : "no_answer",
        answer?.selectedChoiceId || "",
        answer?.selectedChoiceId ? choiceText(question, answer.selectedChoiceId) : "",
        answer?.answerText || "",
        correctAnswerText(question),
        isVoided || !hasAnswer ? "" : Boolean(answer.isCorrect),
        isVoided ? "" : answer?.isCorrect ? 1 : 0,
        answer?.selectedAt || "",
      ]);
    });
  });

  const questionHeaders = [
    "room_code",
    "question_number",
    "question_id",
    "question_type",
    "question_state",
    "prompt",
    "image_url",
    "choice_a",
    "choice_b",
    "choice_c",
    "choice_d",
    "choice_e",
    "correct_answer",
    "accepted_answers",
    "explanation",
    "time_limit_seconds",
    "voided_at",
  ];
  const questionRows = room.questions.map((question, index) => {
    const choices = questionChoices(question);
    return [
      room.code,
      index + 1,
      question.id,
      normalizeQuestionType(question.questionType),
      question.state || "",
      question.prompt || "",
      question.imageUrl || "",
      choices.choice_a,
      choices.choice_b,
      choices.choice_c,
      choices.choice_d,
      choices.choice_e,
      correctAnswerText(question),
      (question.acceptedAnswers || []).join(" | "),
      question.explanation || "",
      question.timeLimitSeconds || room.globalTimeLimitSeconds || "",
      question.voidedAt || "",
    ];
  });

  return {
    room: {
      code: room.code,
      state: room.state,
      createdAt: room.createdAt || "",
      finishedAt: room.state === "finished" ? new Date().toISOString() : "",
      expiresAt: room.expiresAt || "",
      participantCount: participants.length,
      questionCount: room.questions.length,
      possibleScore,
    },
    summary: {
      headers: summaryHeaders,
      rows: summaryRows,
      objects: objectRows(summaryHeaders, summaryRows),
    },
    responses: {
      headers: responseHeaders,
      rows: responseRows,
      objects: objectRows(responseHeaders, responseRows),
    },
    questions: {
      headers: questionHeaders,
      rows: questionRows,
      objects: objectRows(questionHeaders, questionRows),
    },
  };
}

function csvCell(value) {
  const text = String(value == null ? "" : value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvFromSection(section) {
  return [section.headers]
    .concat(section.rows)
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

module.exports = {
  buildResultExport,
  csvFromSection,
};
