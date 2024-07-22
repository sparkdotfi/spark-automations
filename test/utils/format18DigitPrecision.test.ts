import { BigNumber } from 'ethers'

import { format18DigitPrecision } from '../../utils'
import { expect } from 'chai'

describe('format18DigitPrecision', () => {
    let rawArt: BigNumber

    it('under a million', () => {
        rawArt = BigNumber.from('957177776653297469065144')
        expect(format18DigitPrecision(rawArt.toString())).to.equal('957,177.776653297469065144')
    })

    it('under a billion', () => {
        rawArt = BigNumber.from('959437177776653297469065144')
        expect(format18DigitPrecision(rawArt.toString())).to.equal('959,437,177.776653297469065144')
    })

    it('over a billion', () => {
        rawArt = BigNumber.from('1959437177776653297469065144')
        expect(format18DigitPrecision(rawArt.toString())).to.equal('1,959,437,177.776653297469065144')
    })

    it('over ten billions', () => {
        rawArt = BigNumber.from('21959437177776653297469065144')
        expect(format18DigitPrecision(rawArt.toString())).to.equal('21,959,437,177.776653297469065144')
    })
})
