import { request } from './request';
import type {
  ExerciseQuestionDTO,
  ExerciseSheetDTO,
  ExerciseSheetDetailDTO,
  CreateSheetRequest,
  UpdateSheetRequest,
  AddSheetQuestionRequest,
  SheetQuestionDTO,
} from '../types/exercise';

export const exerciseApi = {
  async fetchQuestions(domain: string, count: number = 5): Promise<ExerciseQuestionDTO[]> {
    return request.get<ExerciseQuestionDTO[]>('/api/exercise/questions', {
      params: { domain, count },
    });
  },

  async getAnswer(id: number): Promise<ExerciseQuestionDTO> {
    return request.get<ExerciseQuestionDTO>(`/api/exercise/questions/${id}/answer`);
  },

  async generateQuestions(domain: string, count: number): Promise<void> {
    return request.post<void>('/api/exercise/questions/generate', { domain, count });
  },

  async favoriteQuestion(id: number, sheetId: number): Promise<void> {
    return request.post<void>(`/api/exercise/questions/${id}/favorite`, null, {
      params: { sheetId },
    });
  },

  async listSheets(): Promise<ExerciseSheetDTO[]> {
    return request.get<ExerciseSheetDTO[]>('/api/exercise/sheets');
  },

  async createSheet(data: CreateSheetRequest): Promise<ExerciseSheetDTO> {
    return request.post<ExerciseSheetDTO>('/api/exercise/sheets', data);
  },

  async getSheetDetail(id: number): Promise<ExerciseSheetDetailDTO> {
    return request.get<ExerciseSheetDetailDTO>(`/api/exercise/sheets/${id}`);
  },

  async updateSheet(id: number, data: UpdateSheetRequest): Promise<ExerciseSheetDTO> {
    return request.put<ExerciseSheetDTO>(`/api/exercise/sheets/${id}`, data);
  },

  async deleteSheet(id: number): Promise<void> {
    return request.delete<void>(`/api/exercise/sheets/${id}`);
  },

  async addSheetQuestions(id: number, questions: AddSheetQuestionRequest[]): Promise<SheetQuestionDTO[]> {
    return request.post<SheetQuestionDTO[]>(`/api/exercise/sheets/${id}/questions`, questions);
  },

  async deleteSheetQuestion(sheetId: number, questionId: number): Promise<void> {
    return request.delete<void>(`/api/exercise/sheets/${sheetId}/questions/${questionId}`);
  },

  async practiceFromSheet(id: number, count: number = 0): Promise<ExerciseQuestionDTO[]> {
    return request.post<ExerciseQuestionDTO[]>(`/api/exercise/sheets/${id}/practice`, null, {
      params: { count },
    });
  },
};
