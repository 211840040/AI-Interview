package interview.guide.modules.exercise.repository;

import interview.guide.modules.exercise.model.ExerciseSheetEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExerciseSheetRepository extends JpaRepository<ExerciseSheetEntity, Long> {
}
