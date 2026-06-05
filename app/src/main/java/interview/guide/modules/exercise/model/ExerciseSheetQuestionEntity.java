package interview.guide.modules.exercise.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
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
@Table(name = "exercise_sheet_question")
public class ExerciseSheetQuestionEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "sheet_id", nullable = false)
  private ExerciseSheetEntity sheet;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String question;

  @Column(name = "reference_answer", nullable = false, columnDefinition = "TEXT")
  private String referenceAnswer;

  @Column(name = "sort_order", nullable = false)
  private Integer sortOrder;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  @jakarta.persistence.PrePersist
  protected void onCreate() {
    createdAt = LocalDateTime.now();
  }
}
