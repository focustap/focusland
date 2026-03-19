type InputPromptProps = {
  alt: string;
  label?: string;
  src: string;
};

const InputPrompt = ({ alt, label, src }: InputPromptProps) => (
  <span className="input-prompt" title={alt}>
    <img src={src} alt={alt} />
    {label ? <span>{label}</span> : null}
  </span>
);

export default InputPrompt;
