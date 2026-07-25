package sh.ravix.platform;

import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Function;
import org.jboss.logging.Logger;
import sh.ravix.entity.BackgroundTask;
import sh.ravix.util.Ids;

/**
 * Runs long-running shell-like work off the HTTP request thread so the panel
 * stays responsive. The HTTP endpoint just creates a {@link BackgroundTask}
 * row and returns its id; the worker updates status / log as it goes, and
 * the UI polls /api/tasks/{id}.
 *
 * One persistent executor for the panel's whole lifetime — keeps it simple
 * and bounded.
 */
@ApplicationScoped
public class TaskService {

    private static final Logger LOG = Logger.getLogger(TaskService.class);
    private static final int WORKERS = 4;

    private final ExecutorService pool = Executors.newFixedThreadPool(WORKERS, r -> {
        Thread t = new Thread(r, "ravix-task");
        t.setDaemon(true);
        return t;
    });

    /** Create a "running" task row and return it. */
    @Transactional
    public BackgroundTask start(String kind, String target, String action) {
        BackgroundTask t = new BackgroundTask();
        t.id = Ids.generate("task");
        t.kind = kind;
        t.target = target;
        t.action = action;
        t.status = "running";
        t.startedAt = OffsetDateTime.now();
        t.log = "";
        t.persist();
        return t;
    }

    /**
     * Submit a unit of work. {@code body} receives a log-appender it can
     * call any time to surface progress to the UI; its String return value
     * is appended to the log on completion. Throwing fails the task.
     */
    public void submit(String taskId, Function<LogSink, String> body) {
        pool.submit(() -> {
            LogSink sink = new LogSink(taskId);
            try {
                String tail = body.apply(sink);
                complete(taskId, "ok", tail);
            } catch (Exception e) {
                LOG.warnf("Task %s failed: %s", taskId, e.getMessage());
                complete(taskId, "failed", "Error: " + e.getMessage());
            }
        });
    }

    @Transactional
    public BackgroundTask get(String id) {
        return BackgroundTask.findById(id);
    }

    @Transactional
    public List<BackgroundTask> recent(String kind, boolean activeOnly, int limit) {
        String where;
        Object[] args;
        if (kind != null && !kind.isBlank() && activeOnly) {
            where = "kind = ?1 and status = 'running'";
            args  = new Object[]{kind};
        } else if (kind != null && !kind.isBlank()) {
            where = "kind = ?1";
            args  = new Object[]{kind};
        } else if (activeOnly) {
            where = "status = 'running'";
            args  = new Object[0];
        } else {
            return BackgroundTask.<BackgroundTask>findAll(Sort.by("startedAt").descending())
                    .page(0, limit).list();
        }
        return BackgroundTask.<BackgroundTask>find(where, Sort.by("startedAt").descending(), args)
                .page(0, limit).list();
    }

    @Transactional
    void append(String id, String chunk) {
        BackgroundTask t = BackgroundTask.findById(id);
        if (t == null) return;
        // Cap the log so a runaway process can't blow up the table.
        String next = (t.log == null ? "" : t.log) + chunk;
        if (next.length() > 100_000) {
            next = "…(truncated)…\n" + next.substring(next.length() - 80_000);
        }
        t.log = next;
    }

    @Transactional
    void complete(String id, String status, String tail) {
        BackgroundTask t = BackgroundTask.findById(id);
        if (t == null) return;
        if (tail != null && !tail.isEmpty()) {
            t.log = (t.log == null ? "" : t.log) + tail;
        }
        t.status = status;
        t.finishedAt = OffsetDateTime.now();
    }

    /** Simple log appender handed to task bodies. */
    public class LogSink {
        private final String taskId;
        public LogSink(String taskId) { this.taskId = taskId; }
        public void append(String chunk) {
            if (chunk == null || chunk.isEmpty()) return;
            TaskService.this.append(taskId, chunk.endsWith("\n") ? chunk : chunk + "\n");
        }
    }
}
