export class InvalidTransition extends Error {
  constructor(
    public readonly status: string,
    public readonly type: string,
  ) {
    super(`Cannot apply ${type} while workout is ${status}.`);
  }
}

export class InvalidArgument extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArgument';
  }
}
