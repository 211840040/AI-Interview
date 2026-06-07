package interview.guide.modules.exercise.repository;

import interview.guide.modules.exercise.model.ExerciseQuestionPoolEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExerciseQuestionPoolRepository extends JpaRepository<ExerciseQuestionPoolEntity, Long> {

  List<ExerciseQuestionPoolEntity> findByDomain(String domain);

  long countByDomain(String domain);

  long countByDomainAndDoneCnt(String domain, int doneCnt);

  @Query("select e from ExerciseQuestionPoolEntity e where e.domain = :domain and e.countdown = 0 and e.doneCnt = 0")
  List<ExerciseQuestionPoolEntity> findNewQuestions(String domain);

  @Query("select e from ExerciseQuestionPoolEntity e where e.domain = :domain and e.countdown = 0 and e.doneCnt > 0")
  List<ExerciseQuestionPoolEntity> findReviewableQuestions(String domain);

  @Query("select e from ExerciseQuestionPoolEntity e where e.domain = :domain order by e.doneCnt desc")
  List<ExerciseQuestionPoolEntity> findTopDoneQuestions(String domain);

  @Query("select e from ExerciseQuestionPoolEntity e where e.domain = :domain and e.countdown > 0")
  List<ExerciseQuestionPoolEntity> findCoolingDownQuestions(String domain);

  List<ExerciseQuestionPoolEntity> findByDomainAndDoneCntGreaterThan(String domain, int doneCnt);
}
