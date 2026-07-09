import { DomainError } from './errors.js';
import { err, type DomainResult } from './result.js';

export type BusinessUseCase<TInput, TOutput> = {
  name: string;
  execute(input: TInput): Promise<TOutput>;
};

export async function executeUseCase<TInput, TOutput>(
  useCase: BusinessUseCase<TInput, TOutput>,
  input: TInput
): Promise<DomainResult<TOutput, DomainError>> {
  try {
    return { ok: true, value: await useCase.execute(input) };
  } catch (error) {
    if (error instanceof DomainError) return err(error);
    return err(new DomainError('UNEXPECTED_DOMAIN_ERROR', `${useCase.name} failed unexpectedly`, 500));
  }
}
