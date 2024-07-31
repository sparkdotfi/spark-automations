import { expect } from 'chai'

import { formatChi } from '../../utils'

describe('formatChi', () => {
    let chi: string

    it('1099500331978392688367947099', () => {
        chi = '1099500331978392688367947099'
        expect(formatChi(chi)).to.equal('1.099,500,331,978,392,688,367,947,099')
    })
})
