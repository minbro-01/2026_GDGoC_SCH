import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const contentRoot = fileURLToPath(new URL("../../content/question-bank/", import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateQuestion(question, source, seenIds, seenQuestions) {
  assert(question && typeof question === "object", `${source}: question must be an object`);
  assert(typeof question.id === "number" || typeof question.id === "string", `${source}: id is required`);
  const identity = `${source}:${question.id}`;
  assert(!seenIds.has(identity), `${source}: duplicate id ${question.id}`);
  seenIds.add(identity);
  assert(typeof question.question === "string" && question.question.trim(), `${identity}: question is empty`);
  const normalizedQuestion = question.question.replace(/\s+/g, " ").trim().toLowerCase();
  assert(!seenQuestions.has(normalizedQuestion), `${source}: duplicate question text at id ${question.id}`);
  seenQuestions.add(normalizedQuestion);
  assert(["multiple_choice", "ox"].includes(question.type), `${identity}: unsupported question type`);
  if (question.type === "multiple_choice") {
    assert(Array.isArray(question.options) && question.options.length >= 2, `${identity}: at least two options required`);
    assert(typeof question.answer === "string", `${identity}: multiple-choice answer must be a label`);
    assert(
      question.options.some((option) => option.trim().startsWith(`${question.answer}.`)),
      `${identity}: answer label must match an option`
    );
  } else {
    assert(typeof question.answer === "boolean", `${identity}: OX answer must be boolean`);
  }
  assert(typeof question.explanation === "string" && question.explanation.trim(), `${identity}: explanation is empty`);
}

const quizFile = JSON.parse(await readFile(`${contentRoot}stock_quiz.json`, "utf8"));
const examFile = JSON.parse(await readFile(`${contentRoot}exam_questions.json`, "utf8"));

assert(Array.isArray(quizFile.quizzes), "stock_quiz.json: quizzes must be an array");
assert(quizFile.meta.total === quizFile.quizzes.length, "stock_quiz.json: meta.total mismatch");

const quizIds = new Set();
const quizQuestions = new Set();
for (const question of quizFile.quizzes) {
  validateQuestion(question, "stock_quiz", quizIds, quizQuestions);
}

assert(examFile.exams && typeof examFile.exams === "object", "exam_questions.json: exams is required");
const examIds = new Set();
const examQuestions = new Set();
let examTotal = 0;
for (const [tier, exam] of Object.entries(examFile.exams)) {
  assert(typeof exam.tier === "string" && exam.tier.trim(), `exam_questions.json: tier name missing for ${tier}`);
  assert(Array.isArray(exam.questions), `exam_questions.json: ${tier}.questions must be an array`);
  for (const question of exam.questions) {
    assert(question.tier === tier, `exam:${question.id}: tier mismatch`);
    validateQuestion(question, "exam", examIds, examQuestions);
  }
  examTotal += exam.questions.length;
}
assert(examFile.meta.total === examTotal, "exam_questions.json: meta.total mismatch");

console.log(`Validated ${quizFile.quizzes.length} quiz questions and ${examTotal} exam questions.`);
