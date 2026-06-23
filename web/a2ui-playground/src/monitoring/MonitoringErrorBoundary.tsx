import React from 'react';
import { Alert, Button } from 'antd';
import { reportFrontendError } from './client';

interface MonitoringErrorBoundaryState {
  error?: Error;
}

export class MonitoringErrorBoundary extends React.Component<
  React.PropsWithChildren,
  MonitoringErrorBoundaryState
> {
  state: MonitoringErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): MonitoringErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportFrontendError(error, {
      react: {
        componentStack: info.componentStack
      }
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="页面运行异常"
          description={this.state.error.message}
          action={
            <Button onClick={() => window.location.reload()} type="primary">
              刷新
            </Button>
          }
        />
      </div>
    );
  }
}
