import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { pairPollRequestSchema, pairStartRequestSchema } from '@hostly/contracts';
import type {
  PairPollRequest,
  PairPollResponse,
  PairStartRequest,
  PairStartResponse,
} from '@hostly/contracts';
import { Public } from '@shared/decorators/public.decorator';
import { ContractBodyPipe } from '@shared/pipes/contract-body.pipe';
import {
  ApiRateLimitError,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import { StartPairingUseCase } from '../use-cases/start-pairing.use-case';
import { PollPairingUseCase } from '../use-cases/poll-pairing.use-case';

// Called by the robot before it has a token. Bodies follow the @hostly/contracts pairing schemas.
@ApiTags('Device')
@Controller({ path: 'device/pair', version: '1' })
export class DevicePairingController {
  constructor(
    private readonly startPairing: StartPairingUseCase,
    private readonly pollPairing: PollPairingUseCase,
  ) {}

  @Post('start')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start pairing: returns the six-digit code the robot shows (10 min)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['serial'],
      properties: { serial: { type: 'string', example: 'LB0123456789' } },
    },
  })
  @ApiResponse({ status: 201, description: 'pairingId, code and expiresAt (contract pair-start)' })
  @ApiValidationError()
  @ApiRateLimitError()
  @ApiServerError()
  async start(
    @Body(new ContractBodyPipe(pairStartRequestSchema)) body: PairStartRequest,
    @Ip() ip: string,
  ): Promise<PairStartResponse> {
    return this.startPairing.execute({ serial: body.serial, ip });
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Poll a pairing: pending, approved (with the device token, once) or expired',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['pairingId'],
      properties: { pairingId: { type: 'string', format: 'uuid' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Contract pair-poll response' })
  @ApiValidationError()
  @ApiRateLimitError()
  @ApiServerError()
  async poll(
    @Body(new ContractBodyPipe(pairPollRequestSchema)) body: PairPollRequest,
  ): Promise<PairPollResponse> {
    return this.pollPairing.execute(body.pairingId);
  }
}
