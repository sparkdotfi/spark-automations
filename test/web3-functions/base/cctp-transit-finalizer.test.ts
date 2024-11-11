import { expect } from 'chai'
import { computeCctpNonceAndSourceHash } from '../../../web3-functions/cctp-transit-finalizer/computeCctpNonceAndSourceHash'

describe.only('CCTP Transit Finalizer', function () {
    this.timeout(0)

    describe('computeCctpNonceAndSourceHash', () => {
        it('computes a correct hash', async () => {
            expect(computeCctpNonceAndSourceHash(126243, 0)).to.equal(
                '0xb9aaef599f642b85caf4949c74327c1644d1c91b524ea2d2c73440c67c4018f9',
            )
        })
    })

    describe('filterOutFinalizedInitializations', () => {
        it.skip('correctly filters out transit initializations that were already finalized', async () => {})
    })
})
