import { expect } from 'chai'

import { formatChi } from '../../utils'

describe('formatChi', () => {
    let chi: string

    it('1099500331978392688367947099', () => {
        chi = '1099500331978392688367947099'
        expect(formatChi(chi)).to.equal('1.099')
    })

    it('1139540335978692688367947092', () => {
        chi = '1139540335978692688367947092'
        expect(formatChi(chi)).to.equal('1.139')
    })
})
