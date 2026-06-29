import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] React Component rendering crashed:', error, errorInfo);
    logger.error(error.message, error, 'ErrorBoundary');
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    // Attempt to reload or reset state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Ionicons name="warning-outline" size={48} color={colors.danger} />
            </View>
            
            <Text style={styles.title}>Something went wrong</Text>
            
            <Text style={styles.subtitle}>
              The application encountered an unexpected error and had to pause. You can attempt to reload the interface.
            </Text>

            <Pressable style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Reload Application</Text>
            </Pressable>

            <Pressable 
              style={styles.detailsToggle} 
              onPress={() => this.setState(s => ({ showDetails: !s.showDetails }))}
            >
              <Text style={styles.detailsToggleText}>
                {this.state.showDetails ? 'Hide Error details' : 'Show Error details'}
              </Text>
            </Pressable>

            {this.state.showDetails && (
              <ScrollView style={styles.detailsContainer} contentContainerStyle={styles.detailsContent}>
                <Text style={styles.errorText}>
                  {this.state.error?.toString() || 'Unknown Error'}
                </Text>
                {this.state.errorInfo?.componentStack && (
                  <Text style={styles.stackText}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1E1E2E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(235, 87, 87, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#A0A0B0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  detailsToggle: {
    paddingVertical: 8,
  },
  detailsToggleText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  detailsContainer: {
    width: '100%',
    maxHeight: 180,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    marginTop: 16,
    padding: 12,
  },
  detailsContent: {
    paddingBottom: 16,
  },
  errorText: {
    color: '#E57373',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    marginBottom: 8,
  },
  stackText: {
    color: '#ECEFF1',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 14,
  },
});
