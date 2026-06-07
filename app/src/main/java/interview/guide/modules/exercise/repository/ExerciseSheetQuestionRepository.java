package interview.guide.modules.exercise.repository;

import interview.guide.modules.exercise.model.ExerciseSheetQuestionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExerciseSheetQuestionRepository extends JpaRepository<ExerciseSheetQuestionEntity, Long> {

  List<ExerciseSheetQuestionEntity> findBySheetIdOrderBySortOrderAsc(Long sheetId);

  @Query("select count(e) from ExerciseSheetQuestionEntity e where e.sheet.id = :sheetId")
  long countBySheetId(Long sheetId);

  @Modifying
  @Query("delete from ExerciseSheetQuestionEntity e where e.sheet.id = :sheetId")
  void deleteBySheetId(Long sheetId);
}
