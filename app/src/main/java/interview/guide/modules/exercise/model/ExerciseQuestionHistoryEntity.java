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
@Table(name = "exercise_question_history")
public class ExerciseQuestionHistoryEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 64)
  private String domain;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String question;

  @Column(name = "reference_answer", nullable = false, columnDefinition = "TEXT")
  private String referenceAnswer;

  @Column(name = "fetched_at", nullable = false)
  private LocalDateTime fetchedAt;

  @jakarta.persistence.PrePersist
  protected void onCreate() {
    fetchedAt = LocalDateTime.now();
  }
}
