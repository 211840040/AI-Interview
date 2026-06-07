export interface ExerciseQuestionDTO {
  id: number;
  domain?: string;
  question: string;
  referenceAnswer?: string;
}

export interface ExerciseSheetDTO {
  id: number;
  name: string;
  tags?: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseSheetDetailDTO {
  id: number;
  name: string;
  tags?: string;
  questions: SheetQuestionDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface SheetQuestionDTO {
  id: number;
  question: string;
  referenceAnswer?: string;
  sortOrder: number;
}

export interface CreateSheetRequest {
  name: string;
  tags?: string;
}

export interface UpdateSheetRequest {
  name: string;
  tags?: string;
}

export interface AddSheetQuestionRequest {
  question: string;
  referenceAnswer: string;
}

export interface ExerciseDomain {
  key: string;
  label: string;
  icon: string;
}
