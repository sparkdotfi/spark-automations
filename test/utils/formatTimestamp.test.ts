import { formatTimestamp } from '../../utils'
import { expect } from 'chai'

describe('formatTimestamp', () => {
    let timestamp: number

    it('1722351455', () => {
        timestamp = 1722351455
        expect(formatTimestamp(timestamp)).to.equal('30 Jul 2024 14:57:35')
    })

    it('1721746391', () => {
        timestamp = 1721746391
        expect(formatTimestamp(timestamp)).to.equal('23 Jul 2024 14:53:11')
    })

    it('1710747315', () => {
        timestamp = 1710747315
        expect(formatTimestamp(timestamp)).to.equal('18 Mar 2024 07:35:15')
    })
})
