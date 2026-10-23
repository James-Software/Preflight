import type { ReactNode } from "react";
import { BranchIcon } from "./GitIcons";

type LogEntry = {
  time: string;
  level: "info" | "error" | "judge" | "fix";
  message: string;
};

export function LogBlock({
  title,
  entries,
}: {
  title: string;
  entries: LogEntry[];
}) {
  return (
    <figure className="run-log-block">
      <figcaption className="run-block-header">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true">›_</span>
          {title}
        </span>
        <span className="run-block-meta">agent-2</span>
      </figcaption>
      <pre className="run-log-content">
        <code>
          {entries.map((entry, index) => (
            <span
              key={index}
              className={`run-log-entry run-log-${entry.level}`}
            >
              <span className="run-log-time">{entry.time}</span>
              <span className="run-log-level">{entry.level.toUpperCase()}</span>
              <span>
                {entry.message}
                {index < entries.length - 1 && "\n"}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

function SourceLine({
  number,
  change,
  children,
}: {
  number: string;
  change?: "removed" | "added";
  children: ReactNode;
}) {
  return (
    <span className={`run-code-line${change ? ` run-code-${change}` : ""}`}>
      <span className="run-code-number" aria-hidden="true">
        {number}
      </span>
      <span aria-hidden="true">
        {change === "removed" ? "-" : change === "added" ? "+" : " "}
      </span>
      <span className="run-code-source">
        {children}
        {"\n"}
      </span>
    </span>
  );
}

export function FixCodeBlock({ compact = false }: { compact?: boolean }) {
  return (
    <figure className="run-code-block">
      <figcaption className="run-block-header">
        <span className="break-all">app/checkout/page.tsx</span>
        <span className="run-block-meta">TSX · diff</span>
      </figcaption>
      {!compact && (
        <div className="run-diff-summary">
          <span className="run-branch">
            <BranchIcon />
            fix/checkout
          </span>
          <span>−2 / +3 lines</span>
        </div>
      )}
      <pre>
        <code>
          {compact ? (
            <>
              <SourceLine number="88">
                <strong>const</strong>
                {" handlePay = useCallback(() => {"}
              </SourceLine>
              <SourceLine number="89" change="removed">
                {"  pay(plan.id);"}
              </SourceLine>
              <SourceLine number="89" change="added">
                {"  if (plan) pay(plan.id);"}
              </SourceLine>
              <SourceLine number="90" change="removed">
                {"}, []);"}
              </SourceLine>
              <SourceLine number="90" change="added">
                {"}, [plan]);"}
              </SourceLine>
            </>
          ) : (
            <>
              <SourceLine number="88">
                <strong>const</strong>
                {" handlePay = useCallback(() => {"}
              </SourceLine>
              <SourceLine number="89" change="removed">
                {"  pay(plan.id);"}
              </SourceLine>
              <SourceLine number="89" change="added">
                {"  "}
                <strong>if</strong>
                {" (!plan || processing) "}
                <strong>return</strong>
                {";"}
              </SourceLine>
              <SourceLine number="90" change="added">
                {"  pay(plan.id);"}
              </SourceLine>
              <SourceLine number="90" change="removed">
                {"}, []); "}
                <em>{"// stale closure"}</em>
              </SourceLine>
              <SourceLine number="91" change="added">
                {"}, [plan, processing]);"}
              </SourceLine>
              <SourceLine number="92">{""}</SourceLine>
              <SourceLine number="93">
                {"<button onClick={handlePay}>"}
              </SourceLine>
              <SourceLine number="94">{"  Pay now"}</SourceLine>
              <SourceLine number="95">{"</button>"}</SourceLine>
            </>
          )}
        </code>
      </pre>
    </figure>
  );
}
