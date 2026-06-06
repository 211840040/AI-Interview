package interview.guide.modules.exercise.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "exercise_question_pool")
public class ExerciseQuestionPoolEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 64)
  private String domain;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String question;

  @Column(name = "reference_answer", nullable = false, columnDefinition = "TEXT")
  private String referenceAnswer;

  @Column(name = "done_cnt", nullable = false)
  private Integer doneCnt;

  @Column(nullable = false)
  private Integer countdown;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  @jakarta.persistence.PrePersist
  protected void onCreate() {
    createdAt = LocalDateTime.now();
    if (doneCnt == null) doneCnt = 0;
    if (countdown == null) countdown = 0;
  }
}
