import { Component, type ReactNode } from "react";

// 描画で例外が出ても真っ白にしない
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-sm">
        <p className="font-medium">表示できませんでした</p>
        <p className="mt-2 text-sub">
          daemon とこの画面のバージョンが合っていないかもしれません。daemon
          を再起動して、再読み込みしてください。
        </p>
        <pre className="num mt-4 overflow-x-auto rounded-md bg-cell p-3 text-xs text-sub">
          {this.state.error.message}
        </pre>
      </div>
    );
  }
}
