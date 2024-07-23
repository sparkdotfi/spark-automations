import { formatThousandSeparators } from './formatThousandSeparators'

export const format18DigitPrecision = (art: string): string => {
    const weiTail = art.slice(-18)
    const wholeUnits = art.slice(0, -18)
    const formattedWholeUnits = formatThousandSeparators(wholeUnits)

    return [formattedWholeUnits, weiTail].join('.')
}
