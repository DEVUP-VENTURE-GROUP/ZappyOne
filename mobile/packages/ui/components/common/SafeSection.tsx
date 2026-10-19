// A decorative or optional part of a screen: if it throws, it hides itself and is reported, and the rest of the screen carries on.
import { Component, type ReactNode } from 'react';
import { reportError } from '@zappy/core/lib/errorReporter';

export class SafeSection extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportError({ kind: 'js', message: `[${this.props.name}] ${error.message}`, stack: error.stack || '', componentStack: info.componentStack || '', healed: true });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
