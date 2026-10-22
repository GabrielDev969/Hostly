import { plainToInstance } from 'class-transformer';
import { UpdateWorkspaceDto } from './update-workspace.dto';

describe('UpdateWorkspaceDto', () => {
  it('trims name when string', () => {
    const dto = plainToInstance(UpdateWorkspaceDto, { name: '  Acme  ' });
    expect(dto.name).toBe('Acme');
  });

  it('passes non-string name through unchanged', () => {
    const dto = plainToInstance(UpdateWorkspaceDto, { name: 7 });
    expect(dto.name as unknown as number).toBe(7);
  });
});
