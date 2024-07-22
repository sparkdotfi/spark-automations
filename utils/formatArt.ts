import { formatThousandSeparators } from './formatThousandSeparators'

export const formatArt = (art: string): string => {
    const weiTail = art.slice(-18)
    const wholeUnits = art.slice(0, -18)
    const formattedWholeUnits = formatThousandSeparators(wholeUnits)

    return [formattedWholeUnits, weiTail].join('.')
}
