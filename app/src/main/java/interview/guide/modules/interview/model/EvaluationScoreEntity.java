package interview.guide.modules.interview.model;

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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "evaluation_scores")
public class EvaluationScoreEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "session_id", nullable = false, insertable = false, updatable = false)
  private InterviewSessionEntity session;

  @Column(name = "session_id", nullable = false)
  private Long sessionId;

  @Column(name = "dimension", nullable = false, length = 64)
  private String dimension; // Communication, Technical Knowledge, Problem Solving, Project Storytelling

  @Column(name = "score", nullable = false)
  private Integer score;

  @Column(name = "anchor_label", length = 32)
  private String anchorLabel;

  @Column(name = "rationale", columnDefinition = "TEXT")
  private String rationale;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "evidence", columnDefinition = "jsonb")
  private String evidence; // JSON array: [{"text":"..."}, ...]

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "action_items", columnDefinition = "jsonb")
  private String actionItems; // JSON array

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "raw_json", columnDefinition = "jsonb")
  private String rawJson;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;
}
