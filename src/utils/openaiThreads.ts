export type StreamEventTypes =
  | 'thread.created'
  | 'thread.run.created'
  | 'thread.run.queued'
  | 'thread.run.in_progress'
  | 'thread.run.requires_action'
  | 'thread.run.completed'
  | 'thread.run.incomplete'
  | 'thread.run.failed'
  | 'thread.run.cancelling'
  | 'thread.run.cancelled'
  | 'thread.run.expired'
  | 'thread.run.step.created'
  | 'thread.run.step.in_progress'
  | 'thread.run.step.delta'
  | 'thread.run.step.completed'
  | 'thread.run.step.failed'
  | 'thread.run.step.cancelled'
  | 'thread.run.step.expired'
  | 'thread.message.created'
  | 'thread.message.in_progress'
  | 'thread.message.delta'
  | 'thread.message.completed'
  | 'thread.message.incomplete'
  | 'error';

export type StreamEvent = {
  event: StreamEventTypes;
  data: any;
};
