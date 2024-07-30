import { expect } from 'chai'

import { formatDsr } from '../../utils'

describe('formatDsr', () => {
    let dsr: string

    it('7.00%', () => {
        dsr = '1000000002145441671308778766'
        expect(formatDsr(dsr)).to.equal('7.00%')
    })

    it('21.00%', () => {
        dsr = '1000000006044531969328866955'
        expect(formatDsr(dsr)).to.equal('21.00%')
    })

    it('3.70%', () => {
        dsr = '1000000001152077919467240095'
        expect(formatDsr(dsr)).to.equal('3.70%')
    })

    it('33.25%', () => {
        dsr = '1000000009102513900441785827'
        expect(formatDsr(dsr)).to.equal('33.25%')
    })
})
