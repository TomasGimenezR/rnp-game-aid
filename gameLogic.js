function getRandomInt() {
    return Math.floor(Math.random() * 6) + 1;
}

// Roll your dice pool and return the results
const rollDice = (roller) => {
    let heroDiceResults = []
    let redDiceResults = []
    let blackDiceResults = []
    let suns = 0;
    let skulls = 0;
    for (let i = 0 ; i < roller.dicePool.hero; i++) {
        let result = getRandomInt();
        switch(result) {
            case 6:
            case 5:
                suns += 1;
                heroDiceResults.push("☀");
                break;
            case 4:
            case 3:
                heroDiceResults.push("⬜");
                break;
            case 1:
            case 2:
                skulls += 1;
                heroDiceResults.push("💀");
                break;
        }
    }
    for (let i = 0 ; i < roller.dicePool.red; i++) {
        let result = getRandomInt();
        switch(result) {
            case 6:
            case 5:
            case 2:
            case 1:
                skulls += 1;
                redDiceResults.push("💀");
                break;
            case 4:
            case 3:
                redDiceResults.push("⬜");
                break;
        }
    }
    for (let i = 0 ; i < roller.dicePool.black; i++) {
        let result = getRandomInt();
        switch(result) {
            case 6:
            case 5:
                skulls += 2;
                blackDiceResults.push("💀💀");
                break;
            case 4:
            case 3:
                blackDiceResults.push("⬜");
                break;
            case 1:
            case 2:
                skulls += 1;
                blackDiceResults.push("💀");
                break;
        }
    }
    return {
        heroDiceResults,
        redDiceResults,
        blackDiceResults,
        suns,
        skulls
    }
}

const forcedRoll = (roller) => {
    let success = true;
    let results = rollDice(roller);
    
    if (results.skulls > results.suns) {
        success = false;
    }
    results.success = success;
    return results;
}

const setDicePool = (roller, newDicePool) => {
    roller.dicePool = newDicePool;
};

const replaceForRedDie = (roller) => {
    if (roller.dicePool.hero > 0) {
        roller.dicePool.hero--;
        roller.dicePool.red++;
    }
    return roller.dicePool;
}

const replaceForBlackDie = (roller) => {
    if (roller.dicePool.hero > 0) {
        roller.dicePool.hero--;
        roller.dicePool.black++;
    }
    return roller.dicePool;
}

const addRedDie = (roller) => {
    roller.dicePool.red++;
    return roller.dicePool;
}

const subtractRedDie = (roller) => {
    if (roller.dicePool.red > 0) {
        roller.dicePool.red--;
    }
    return roller.dicePool;
}

const addBlackDie = (roller) => {
    roller.dicePool.black++;
    return roller.dicePool;
}

const subtractBlackDie = (roller) => {
    if (roller.dicePool.black > 0) {
        roller.dicePool.black--;
    }
    return roller.dicePool;
}

class GameRoom {
    constructor(gameRoomId, gameName, em) {
        this.gameRoomId = gameRoomId;
        this.name = gameName;
        this.em = em;
        this.heroes = [];
        this.qualities = [];
        this.dread = 0;
        this.momentum = 0;
        this.drama = 0;
        this.gameState = 'Downtime';
        this.createdAt = new Date();
        this.dicePool = {
            hero: 2,
            red: 0,
            black: 0,
        };
    }

    addHero(hero) {
        this.heroes.push(hero);
    }

    actionRoll = () => {
        this.dicePool.hero++;
        let diceResults = rollDice(this);
        this.momentum += diceResults.suns;
        this.drama += diceResults.skulls;
        return diceResults;
    }

    forcedRoll = () => {
        return forcedRoll(this);
    }

     // ALTER DICE POOL METHODS --------------
    setDicePool = (dicePool) => {
        setDicePool(this, dicePool);
    }
    
    replaceForRedDie = () => {
        return replaceForRedDie(this);
    }

    replaceForBlackDie = () => {
        return replaceForBlackDie(this);
    }

    addRedDie = () => {
        return addRedDie(this);
    }

    subtractRedDie = () => {
        return subtractRedDie(this);
    }

    addBlackDie = () => {
        return addBlackDie(this);
    }

    subtractBlackDie = () => {
        return subtractBlackDie(this);
    }

    alterDread = (amount) => {
        if (amount < 0 && Math.abs(amount) > this.dread) {
            throw new Error('Not enough Dread to spend');
        }
        this.dread += amount;
        return this.dread;
    }

    spendMomentum = (amount) => {
        if (amount > this.momentum) {
            throw new Error('Not enough Momentum to spend');
        }
        this.momentum -= amount;
        return this.momentum;
    }

    setMomentum = (amount) => {
        if (amount < 0) {
            throw new Error('Momentum cannot be negative');
        }
        this.momentum = amount;
        return this.momentum;
    }

    alterDrama = (amount) => {
        if (amount < 0 && Math.abs(amount) > this.drama) {
            throw new Error('Not enough Drama to spend');
        }
        this.drama += amount;
        return this.drama;
    }

    setDicePool = (dicePool) => {
        setDicePool(this, dicePool);
    }
}

class Hero {
    constructor({ name, archetypeId, heroPathId }) {
        this.name = name;
        this.archetypeId = archetypeId;
        this.hp = -1;
        this.hope = 0;
        this.qualities = [];
        this.dicePool = {
            hero: 2,
            red: 0,
            black: 0,
        };
        this.heroPathId = heroPathId;
    }

    // Perform an Action Roll, adding one Hero Die to the pool
    actionRoll = () => {
        this.dicePool.hero++;
        let madeAnEscape = false;
        let diceResults = rollDice(this);
        this.hope += diceResults.suns;
        if (diceResults.skulls == 0) 
            madeAnEscape = true;
        
        diceResults.madeAnEscape = madeAnEscape;
        return diceResults;
    }

    forcedRoll = () => {
        return forcedRoll(this);
    }

    // ALTER DICE POOL METHODS --------------
    setDicePool = (dicePool) => {
        setDicePool(this, dicePool);
    }
    
    replaceForRedDie = () => {
        return replaceForRedDie(this);
    }

    replaceForBlackDie = () => {
        return replaceForBlackDie(this);
    }

    addRedDie = () => {
        return addRedDie(this);
    }

    subtractRedDie = () => {
        return subtractRedDie(this);
    }

    addBlackDie = () => {
        return addBlackDie(this);
    }

    subtractBlackDie = () => {
        return subtractBlackDie(this);
    }

    setHope = (amount) => {
        if (amount < 0) {
            throw new Error('Hope cannot be negative');
        }
        this.hope = amount;
        return this.hope;
    }

    spendHope = (amount) => {
        if (amount > this.hope) {
            throw new Error('Not enough Hope to spend');
        }
        this.hope -= amount;
        return this.hope;
    }

}

export { Hero, GameRoom };