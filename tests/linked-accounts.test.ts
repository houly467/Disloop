import { describe, expect, it } from 'vitest'
import { mergeLinkedAccountRelationships } from '@/lib/linked-accounts'

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_C = '33333333-3333-4333-8333-333333333333'
const ACCOUNT_D = '44444444-4444-4444-8444-444444444444'

describe('linked account consolidation', () => {
  it('links a new account to the currently signed-in account group', () => {
    expect(mergeLinkedAccountRelationships(ACCOUNT_A, ACCOUNT_B, [])).toEqual({
      ownerUserId: ACCOUNT_A,
      relationships: [{ ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_B }],
    })
  })

  it('consolidates two existing groups under the current account owner', () => {
    expect(mergeLinkedAccountRelationships(ACCOUNT_A, ACCOUNT_C, [
      { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_B },
      { ownerUserId: ACCOUNT_C, accountUserId: ACCOUNT_D },
    ])).toEqual({
      ownerUserId: ACCOUNT_A,
      relationships: [
        { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_B },
        { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_C },
        { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_D },
      ],
    })
  })

  it('normalizes nested links when either account is already a child', () => {
    expect(mergeLinkedAccountRelationships(ACCOUNT_B, ACCOUNT_D, [
      { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_B },
      { ownerUserId: ACCOUNT_C, accountUserId: ACCOUNT_D },
    ])).toEqual({
      ownerUserId: ACCOUNT_A,
      relationships: [
        { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_B },
        { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_C },
        { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_D },
      ],
    })
  })

  it('rejects attempts to link the same account', () => {
    expect(() => mergeLinkedAccountRelationships(ACCOUNT_A, ACCOUNT_A, [])).toThrow('same_account')
  })

  it('rejects cyclic existing relationships instead of silently corrupting ownership', () => {
    expect(() => mergeLinkedAccountRelationships(ACCOUNT_A, ACCOUNT_C, [
      { ownerUserId: ACCOUNT_A, accountUserId: ACCOUNT_B },
      { ownerUserId: ACCOUNT_B, accountUserId: ACCOUNT_A },
    ])).toThrow('linked_accounts_cycle')
  })
})
