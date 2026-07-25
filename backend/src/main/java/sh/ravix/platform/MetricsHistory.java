package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/** Keeps a short in-memory ring of recent CPU / queue samples for sparklines. */
@ApplicationScoped
public class MetricsHistory {

    private static final int SIZE = 24;
    private final Deque<Double> cpu = new ArrayDeque<>();
    private final Deque<Double> queue = new ArrayDeque<>();

    public synchronized void record(double cpuPercent, double queueDepth) {
        push(cpu, cpuPercent);
        push(queue, queueDepth);
    }

    public synchronized List<Double> cpu() {
        return new ArrayList<>(cpu);
    }

    public synchronized List<Double> queue() {
        return new ArrayList<>(queue);
    }

    private void push(Deque<Double> d, double v) {
        d.addLast(v);
        while (d.size() > SIZE) {
            d.removeFirst();
        }
    }
}
