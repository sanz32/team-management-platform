const CASCADE_MAX_INDEX = 10;

export function cascadeStyle(index: number): React.CSSProperties {
  return { "--cascade-i": Math.min(index, CASCADE_MAX_INDEX) } as React.CSSProperties;
}
