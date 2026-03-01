interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

export function StreamingText({ text, isStreaming }: StreamingTextProps) {
  return (
    <span className="streaming-text">
      {text}
      {isStreaming && <span className="chat-cursor">&#x2588;</span>}
    </span>
  );
}
