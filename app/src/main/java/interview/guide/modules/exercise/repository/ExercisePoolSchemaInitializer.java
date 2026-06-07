package interview.guide.modules.exercise.repository;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ExercisePoolSchemaInitializer {

  private final JdbcTemplate jdbcTemplate;

  @PostConstruct
  public void init() {
    addColumnIfMissing("done_cnt", "ALTER TABLE exercise_question_pool ADD COLUMN done_cnt INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing("countdown", "ALTER TABLE exercise_question_pool ADD COLUMN countdown INTEGER NOT NULL DEFAULT 0");
    dropTableIfExists("exercise_question_history");
  }

  private void addColumnIfMissing(String columnName, String alterSql) {
    try {
      jdbcTemplate.queryForObject(
          "SELECT column_name FROM information_schema.columns WHERE table_name='exercise_question_pool' AND column_name=?",
          String.class, columnName);
      log.info("列 {} 已存在，跳过", columnName);
    } catch (Exception e) {
      log.info("列 {} 不存在，执行 ALTER TABLE", columnName);
      jdbcTemplate.execute(alterSql);
      log.info("列 {} 添加成功", columnName);
    }
  }

  private void dropTableIfExists(String tableName) {
    try {
      jdbcTemplate.queryForObject(
          "SELECT table_name FROM information_schema.tables WHERE table_name=?",
          String.class, tableName);
      log.info("删除旧表: {}", tableName);
      jdbcTemplate.execute("DROP TABLE " + tableName);
    } catch (Exception e) {
      // 表不存在，忽略
    }
  }
}
