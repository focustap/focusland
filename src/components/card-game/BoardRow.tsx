import React from "react";

type BoardRowProps = {
  title: string;
  hint?: string;
  children: React.ReactNode;
};

const BoardRow: React.FC<BoardRowProps> = ({ title, hint, children }) => {
  return (
    <section className="card-battle-row">
      <div className="card-battle-row__head">
        <strong>{title}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="card-battle-row__cards">{children}</div>
    </section>
  );
};

export default BoardRow;
