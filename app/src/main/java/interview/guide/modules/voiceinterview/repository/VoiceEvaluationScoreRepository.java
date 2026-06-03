package interview.guide.modules.voiceinterview.repository;

import interview.guide.modules.voiceinterview.model.VoiceEvaluationScoreEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VoiceEvaluationScoreRepository extends JpaRepository<VoiceEvaluationScoreEntity, Long> {

    List<VoiceEvaluationScoreEntity> findBySessionId(Long sessionId);
}