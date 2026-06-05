package interview.guide.modules.exercise.repository;

import interview.guide.modules.exercise.model.ExerciseQuestionPoolEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExerciseQuestionPoolRepository extends JpaRepository<ExerciseQuestionPoolEntity, Long> {

  List<ExerciseQuestionPoolEntity> findByDomain(String domain);

  long countByDomain(String domain);

  @Modifying
  @Query("delete from ExerciseQuestionPoolEntity e where e.id in :ids")
  void deleteByIdIn(List<Long> ids);
}
