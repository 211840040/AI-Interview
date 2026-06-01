package interview.guide.modules.interview.repository;

import interview.guide.modules.interview.model.EvaluationScoreEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EvaluationScoreRepository extends JpaRepository<EvaluationScoreEntity, Long> {

  List<EvaluationScoreEntity> findBySessionId(Long sessionId);

  List<EvaluationScoreEntity> findByDimensionOrderByCreatedAtAsc(String dimension);

  List<EvaluationScoreEntity> findBySessionIdAndDimensionOrderByCreatedAtAsc(
      Long sessionId, String dimension);
}
