import React from "react";

type ActionLogProps = {
  entries: string[];
};

const ActionLog: React.FC<ActionLogProps> = ({ entries }) => {
  return (
    <section className="card-battle-log">
      <div className="card-battle-row__head">
        <strong>Action log</strong>
        <span>Newest first</span>
      </div>
      {entries.length === 0 ? (
        <p className="card-battle-empty">No actions yet.</p>
      ) : (
        <ul className="card-battle-log__list">
          {entries.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ActionLog;
