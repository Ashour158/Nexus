import '@nexus/shared-types';

declare module '@nexus/shared-types' {
  export interface Pipeline {
    stages?: Stage[];
  }
}
