export const formatArt = (art: string): string => {
    const weiTail = art.slice(-18)
    const wholeUnits = art.slice(0, -18)
    const formattedWholeUnits = wholeUnits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

    return [formattedWholeUnits, weiTail].join('.')
}
