package interview.guide.modules.exercise.repository;

import interview.guide.modules.exercise.model.ExerciseQuestionHistoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExerciseQuestionHistoryRepository extends JpaRepository<ExerciseQuestionHistoryEntity, Long> {

  List<ExerciseQuestionHistoryEntity> findTop20ByDomainOrderByFetchedAtDesc(String domain);
}
