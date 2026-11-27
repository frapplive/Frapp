"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { InterestFormQuestion } from "@repo/hooks";
import {
  FORM_OPTION_LABEL_MAX_LENGTH,
  FORM_QUESTION_TITLE_MAX_LENGTH,
  INTEREST_FORM_QUESTIONS_MAX,
  INTEREST_FORM_SETTINGS_COPY as COPY,
} from "@repo/validation";
import {
  INTEREST_QUESTION_TYPES,
  interestQuestionProblem,
  interestQuestionsToSave,
  isChoiceQuestion,
  newInterestFormId,
  withQuestionType,
} from "@repo/hooks/interest-form-questions";
import { ActionMenuButton } from "@/components/shared/row-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/**
 * The chapter's own questions, after the fixed fields. Each change saves the
 * whole list on its own (rulebook § 9): a title or option when its field is
 * left, a type or required switch when it flips. A question on a topic
 * Frapp never collects is held back with the reason beside it, before the
 * server would refuse it.
 */
export function InterestFormQuestionsEditor({
  questions: saved,
  disabled,
  onSave,
}: {
  questions: InterestFormQuestion[];
  disabled: boolean;
  onSave: (questions: InterestFormQuestion[]) => void;
}) {
  const [questions, setQuestions] = useState(saved);

  const problemOf = interestQuestionProblem;

  /** Saves when every question is complete and on an allowed topic. */
  function commit(next: InterestFormQuestion[]) {
    setQuestions(next);
    const ready = interestQuestionsToSave(next);
    if (ready) onSave(ready);
  }

  const edit = (index: number, patch: Partial<InterestFormQuestion>) =>
    questions.map((question, at) =>
      at === index ? { ...question, ...patch } : question,
    );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{COPY.questions}</p>
      <p className="text-caption text-muted-foreground">{COPY.questionsHint}</p>
      {questions.length > 0 ? (
        <ol className="divide-y divide-border rounded-[14px] border border-border bg-card">
          {questions.map((question, index) => {
            const problem = problemOf(question);
            return (
              <li key={question.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Question ${index + 1}`}
                    value={question.title}
                    maxLength={FORM_QUESTION_TITLE_MAX_LENGTH}
                    placeholder="Ask a question"
                    disabled={disabled}
                    aria-invalid={problem ? true : undefined}
                    onChange={(event) =>
                      setQuestions(edit(index, { title: event.target.value }))
                    }
                    onBlur={() => commit(questions)}
                  />
                  <Select
                    value={question.type}
                    disabled={disabled}
                    onValueChange={(type) =>
                      commit(
                        questions.map((each, at) =>
                          at === index
                            ? withQuestionType(
                                each,
                                type as InterestFormQuestion["type"],
                              )
                            : each,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      aria-label={`Kind of question ${index + 1}`}
                      className="h-control-field w-44 shrink-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTEREST_QUESTION_TYPES.map((entry) => (
                        <SelectItem key={entry.type} value={entry.type}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ActionMenuButton
                    label={`More for question ${index + 1}`}
                    disabled={disabled}
                    entries={[
                      {
                        type: "item",
                        key: "delete",
                        label: "Delete question",
                        destructive: true,
                        onSelect: () =>
                          commit(questions.filter((_, at) => at !== index)),
                      },
                    ]}
                  />
                </div>
                {problem ? (
                  <p className="text-caption text-destructive-text">
                    {problem}
                  </p>
                ) : null}
                {isChoiceQuestion(question.type) ? (
                  <ul className="space-y-1.5 pl-3">
                    {(question.options ?? []).map((option, at) => (
                      <li key={option.id} className="flex items-center gap-2">
                        <Input
                          aria-label={`Question ${index + 1}, option ${at + 1}`}
                          className="h-control-row"
                          value={option.label}
                          maxLength={FORM_OPTION_LABEL_MAX_LENGTH}
                          placeholder={`Option ${at + 1}`}
                          disabled={disabled}
                          onChange={(event) =>
                            setQuestions(
                              edit(index, {
                                options: (question.options ?? []).map((each) =>
                                  each.id === option.id
                                    ? { ...each, label: event.target.value }
                                    : each,
                                ),
                              }),
                            )
                          }
                          onBlur={() => commit(questions)}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove option ${at + 1}`}
                          disabled={
                            disabled || (question.options ?? []).length <= 1
                          }
                          onClick={() =>
                            commit(
                              edit(index, {
                                options: (question.options ?? []).filter(
                                  (each) => each.id !== option.id,
                                ),
                              }),
                            )
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                    <li>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() =>
                          setQuestions(
                            edit(index, {
                              options: [
                                ...(question.options ?? []),
                                { id: newInterestFormId(), label: "" },
                              ],
                            }),
                          )
                        }
                      >
                        <Plus className="h-4 w-4" />
                        Add option
                      </Button>
                    </li>
                  </ul>
                ) : null}
                <label className="flex items-center gap-2 text-caption text-muted-foreground">
                  <Switch
                    checked={question.required}
                    disabled={disabled}
                    onCheckedChange={(required) =>
                      commit(edit(index, { required }))
                    }
                  />
                  Required
                </label>
              </li>
            );
          })}
        </ol>
      ) : null}
      {questions.length < INTEREST_FORM_QUESTIONS_MAX ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            setQuestions([
              ...questions,
              {
                id: newInterestFormId(),
                type: "short_answer",
                title: "",
                required: false,
              },
            ])
          }
        >
          <Plus className="h-4 w-4" />
          {COPY.addQuestion}
        </Button>
      ) : null}
    </div>
  );
}
