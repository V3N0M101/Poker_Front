// --- Global Variables and DOM Elements ---
let currentGameState = null; // Stores the current game state from the backend
let activeBetInput = null; // To track which bet input is currently focused for chip clicks
let activeBetButton = null; // To track the currently selected circular bet button

// Animation Speed Configuration
const CARD_DRAW_ANIMATION_SPEED = 500; // ms, duration of the card flying animation
const CARD_DISCARD_ANIMATION_SPEED = 500; // ms, duration of discard animation (if applicable)
const CARD_ANIMATION_DELAY_BETWEEN_CARDS = 150; // ms, delay between drawing/discarding each card

let resultSoundsPlayed = false; // Flag to ensure outcome sound plays only once per round

// Get references to all necessary DOM elements
const dealerCardsDiv = document.getElementById('dealer-cards');
const dealerTotalSpan = document.getElementById('dealer-total');
const playerHandsContainer = document.querySelector('.player'); // The div containing all Player-Area elements
const playerChipsSpan = document.getElementById('player-chips');
const totalBetDisplaySpan = document.getElementById('total-bet-display');
const gameMessageDiv = document.getElementById('game-message');

// Action Buttons (keep these global as they are fixed)
const dealBtn = document.getElementById('dealBtn');
const hitBtn = document.getElementById('hitBtn');
const standBtn = document.getElementById('standBtn');
const doubleBtn = document.getElementById('doubleBtn');
const splitBtn = document.getElementById('splitBtn');
const clearBetsBtn = document.getElementById('clearBetsBtn');
const reBetBtn = document.getElementById('reBetBtn');
const collectBtn = document.getElementById('collectBtn');
const Cooldown_msg = document.getElementById('Cooldown-msg');

let bonusCountdownInterval;

// Chip Buttons
const chipButtons = document.querySelectorAll('.chips button');

/* --- Deal Sound Tracker --- */
let lastTotalCards = 0;

// --- Global trackers for per-hand card counts ---
let lastDealerCardCount = 0;
let lastPlayerHandCardCounts = [];

// --- Click Throttling Timers ---
let dealBtnLastClick = 0;
let hitBtnLastClick = 0;
let standBtnLastClick = 0;
let doubleBtnLastClick = 0;
let splitBtnLastClick = 0;
let clearBetsBtnLastClick = 0;
let reBetBtnLastClick = 0;
const CLICK_THROTTLE_DELAY = 200; // ms

// Bet-All Mode Toggle
const betAllToggle = document.getElementById('betAllToggle');

// Add these at the top with other global variables
let previousBalance = 0;
let previousBet = 0;

function countTotalCards(gameState) {
    let total = 0;
    if (gameState.dealer_hand) {
        total += gameState.dealer_hand.length;
    }
    if (Array.isArray(gameState.player_hands)) {
        gameState.player_hands.forEach(hand => {
            if (Array.isArray(hand.cards)) {
                total += hand.cards.length;
            } else if (Array.isArray(hand)) {
                total += hand.length;
            }
        });
    }
    return total;
}

/* --- Sound Effects Setup --- */
let isMuted = false; // Global toggle for sound

const sounds = {
    blackjack: new Audio('/static/Sounds/blackjack.wav'),
    bonus: new Audio('/static/Sounds/bonus.wav'),
    button: new Audio('/static/Sounds/button.wav'),
    button_hover: new Audio('/static/Sounds/button_hover.wav'),
    chip: new Audio('/static/Sounds/chip.wav'),
    deal: new Audio('/static/Sounds/deal.wav'),
    error: new Audio('/static/Sounds/error.wav'),
    lose: new Audio('/static/Sounds/lose.wav'),
    push: new Audio('/static/Sounds/push.wav'),
    win: new Audio('/static/Sounds/win.wav'),
    carddeal: new Audio('/static/Sounds/carddeal.ogg')
};

Object.values(sounds).forEach(audio => {
    audio.preload = 'auto';
    audio.muted = isMuted;
});

function updateMuteState() {
    Object.values(sounds).forEach(audio => {
        audio.muted = isMuted;
    });
}

function playSound(name) {
    if (isMuted) return;
    const base = sounds[name];
    if (base) {
        const s = base.cloneNode();
        s.play().catch(() => {});
    }
}

// --- Helper Functions ---

function clearCards(container) {
    container.innerHTML = '';
}

function addCardImages(container, cardsArray) {
    const drawImg = document.querySelector('.Draw img');
    const drawRect = drawImg ? drawImg.getBoundingClientRect() : null;

    cardsArray.forEach((card, idx) => {
        setTimeout(() => {
            const img = document.createElement('img');
            img.src = `/static/Images/cards/${card.filename}`;
            img.alt = `${card.rank}${card.suit}`;
            img.dataset.filename = card.filename;
            img.classList.add('card');
            img.style.opacity = '0';
            container.appendChild(img);

            requestAnimationFrame(() => {
                const cardRect = img.getBoundingClientRect();
                if (drawRect) {
                    const dx = drawRect.left - cardRect.left;
                    const dy = drawRect.top - cardRect.top;
                    img.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
                }

                img.style.transition = 'none';

                requestAnimationFrame(() => {
                    img.style.transition = `transform ${CARD_DRAW_ANIMATION_SPEED / 1000}s ease-out, opacity ${CARD_DRAW_ANIMATION_SPEED / 1000}s ease-out`;
                    img.style.transform = 'translate(0, 0) scale(1)';
                    img.style.opacity = '1';

                    // After animation finishes, remove inline transform so CSS :hover works
                    img.addEventListener('transitionend', () => {
                        img.style.transform = '';
                    }, { once: true });
                });
            });
        }, idx * CARD_ANIMATION_DELAY_BETWEEN_CARDS); // Use the new delay variable
    });
}

function syncCards(container, cardsArray) {
    let existing = container.children.length;
    if (cardsArray.length < existing) {
        // reset if fewer cards (new round)
        clearCards(container);
        existing = 0;
    }
    if (cardsArray.length > existing) {
        addCardImages(container, cardsArray.slice(existing));
    }
}

function updateCardFaces(container, cardsArray) {
    const imgs = container.children;
    const len = Math.min(imgs.length, cardsArray.length);
    for (let i = 0; i < len; i++) {
        const imgEl = imgs[i];
        const newFile = cardsArray[i].filename;
        if (imgEl.dataset.filename !== newFile) {
            imgEl.dataset.filename = newFile;
            imgEl.src = `/static/Images/cards/${newFile}`;
        }
    }
}

function setButtonsDisabled(buttons, disable) {
    buttons.forEach(button => {
        if (button) {
            button.disabled = disable;
            if (disable) {
                button.classList.add('disabled');
            } else {
                button.classList.remove('disabled');
            }
        }
    });
}

function setSelectedBetButton(newSelectedButton, betTypeClass = null) {
    // If Bet-All mode is OFF, or no betTypeClass is provided, behave as before
    if (!betAllToggle.checked || !betTypeClass) {
        // Remove selected class from previous button(s)
        if (activeBetButton) {
            if (Array.isArray(activeBetButton)) { // Handles Bet-All mode being turned OFF
                activeBetButton.forEach(btn => {
                    if (btn) {
                        btn.classList.remove('selected');
                        btn.style.border = '2px solid transparent'; // Or your default border
                        btn.style.boxShadow = 'none'; // Or your default box-shadow
                    }
                });
            } else {
                activeBetButton.classList.remove('selected');
                activeBetButton.style.border = '2px solid transparent';
                activeBetButton.style.boxShadow = 'none';
            }
        }
        activeBetButton = newSelectedButton;
        if (activeBetButton) {
            activeBetButton.classList.add('selected');
            activeBetButton.style.border = '2px solid gold';
            activeBetButton.style.boxShadow = '0 0 10px gold';
        }
        return;
    }

    // Bet-All mode is ON and a betTypeClass is provided
    // Deselect all currently active buttons first
    document.querySelectorAll('.Player-Area .bet-area-button.selected').forEach(btn => {
        btn.classList.remove('selected');
        btn.style.border = '2px solid transparent';
        btn.style.boxShadow = 'none';
    });

    const buttonsToSelect = [];
    const inputsToFocus = [];

    const playerHandElements = playerHandsContainer.querySelectorAll('.Player-Area');
    playerHandElements.forEach((handDiv, handIndex) => {
        const handElements = getOrCreatePlayerHandElement(handIndex);
        let targetButton = null;
        let targetInput = null;

        if (betTypeClass === 'PP') {
            targetButton = handElements.ppBetButton;
            targetInput = handElements.sidePPBetInput;
        } else if (betTypeClass === 'MAIN') {
            targetButton = handElements.mainBetDisplay;
            targetInput = handElements.mainBetInput;
        } else if (betTypeClass === 'TWENTYONE') {
            targetButton = handElements.twentyOneBetButton;
            targetInput = handElements.sideTwentyOneBetInput;
        }

        if (targetButton) {
            targetButton.classList.add('selected');
            targetButton.style.border = '2px solid gold';
            targetButton.style.boxShadow = '0 0 10px gold';
            buttonsToSelect.push(targetButton);
        }
        if (targetInput) {
            inputsToFocus.push(targetInput);
        }
    });

    activeBetButton = buttonsToSelect; // Store as an array
    // In Bet-All mode, activeBetInput will also be an array of inputs corresponding to the selected buttons.
    // The chip application logic will need to handle this.
    activeBetInput = inputsToFocus;

    // Optionally, focus the first input of the selected type if needed for accessibility or UX
    // if (inputsToFocus.length > 0) {
    //     inputsToFocus[0].focus(); 
    // }
}

function getOrCreatePlayerHandElement(index) {
    let handEl = document.getElementById(`hand-${index}`);
    if (!handEl) {
        // Create new hand element if it doesn't exist
        handEl = document.createElement('div');
        handEl.id = `hand-${index}`;
        handEl.className = 'Player-Area';
        handEl.innerHTML = `
            <div class="cards" id="cards-hand-${index}"></div>
            <div class="hand-info">
                <span class="hand-total" id="total-hand-${index}">Total:</span>
                <span class="hand-message" id="message-hand-${index}"></span>
            </div>
            <div class="Zone">
                <div class="PP bet-area-button" id="pp-bet-${index}">
                    PP
                    <div class="tooltip-bubble">Perfect Pairs Payouts:<br>Perfect: 25:1<br>Colored: 12:1<br>Mixed: 6:1</div>
                </div>
                <div class="MAIN bet-area bet-area-button" id="main-bet-${index}">
                    <div class="tooltip-bubble">Main Bet Payouts:<br>Blackjack: 3:2<br>Regular Win: 1:1</div>
                </div>
                <div class="TWENTYONE bet-area-button" id="twentyone-bet-${index}">
                    21+3
                    <div class="tooltip-bubble">21+3 Payouts:<br>Suited Trips: 100:1<br>Straight Flush: 40:1<br>Three of a Kind: 30:1<br>Straight: 10:1<br>Flush: 5:1</div>
                </div>
            </div>
            <div class="bet-input-container">
                <input type="number" class="side-bet-input" id="pp-bet-input-${index}" placeholder="PP" value="0" min="0" step="100">
                <input type="number" class="main-bet-input" id="main-bet-input-${index}" placeholder="Main" value="500" min="500" step="500">
                <input type="number" class="side-bet-input" id="twentyone-bet-input-${index}" placeholder="21+3" value="0" min="0" step="100">
            </div>
        `;
        playerHandsContainer.appendChild(handEl);
        
        // Attach event listeners to the new elements
        const hand = {
            area: handEl,
            cardsDiv: document.getElementById(`cards-hand-${index}`),
            totalSpan: document.getElementById(`total-hand-${index}`),
            messageSpan: document.getElementById(`message-hand-${index}`),
            mainBetInput: document.getElementById(`main-bet-input-${index}`),
            sideTwentyOneBetInput: document.getElementById(`twentyone-bet-input-${index}`),
            sidePPBetInput: document.getElementById(`pp-bet-input-${index}`),
            mainBetDisplay: document.getElementById(`main-bet-${index}`),
            ppBetButton: document.getElementById(`pp-bet-${index}`),
            twentyOneBetButton: document.getElementById(`twentyone-bet-${index}`)
        };

        // Add event listeners
        if (hand.mainBetInput) hand.mainBetInput.addEventListener('focus', () => {
            // When focusing an input directly (e.g., tabbing), select its button.
            // If Bet-All is on, it will select all of that type.
            setSelectedBetButton(hand.mainBetDisplay, 'MAIN'); 
            if (!betAllToggle.checked) { // If not bet all, ensure activeBetInput is just this one.
                 activeBetInput = hand.mainBetInput;
            }
        });
        if (hand.sideTwentyOneBetInput) hand.sideTwentyOneBetInput.addEventListener('focus', () => {
            setSelectedBetButton(hand.twentyOneBetButton, 'TWENTYONE');
            if (!betAllToggle.checked) {
                 activeBetInput = hand.sideTwentyOneBetInput;
            }
        });
        if (hand.sidePPBetInput) hand.sidePPBetInput.addEventListener('focus', () => {
            setSelectedBetButton(hand.ppBetButton, 'PP');
            if (!betAllToggle.checked) {
                 activeBetInput = hand.sidePPBetInput;
            }
        });

        if (hand.mainBetDisplay) hand.mainBetDisplay.addEventListener('click', function() {
            playSound('button');
            const betType = 'MAIN';
            setSelectedBetButton(this, betType);
            // If Bet-All is on, activeBetInput is already an array from setSelectedBetButton.
            // If not, set it to the corresponding single input.
            if (!betAllToggle.checked) {
                activeBetInput = hand.mainBetInput;
                if (activeBetInput) activeBetInput.focus();
            } else if (Array.isArray(activeBetInput) && activeBetInput.length > 0) {
                 // Optionally focus the first input in the array for bet-all
                 // activeBetInput[0].focus();
            }
        });
        if (hand.ppBetButton) hand.ppBetButton.addEventListener('click', function() {
            playSound('button');
            const betType = 'PP';
            setSelectedBetButton(this, betType);
            if (!betAllToggle.checked) {
                activeBetInput = hand.sidePPBetInput;
                if (activeBetInput) activeBetInput.focus();
            } else if (Array.isArray(activeBetInput) && activeBetInput.length > 0) {
                // activeBetInput[0].focus();
            }
        });
        if (hand.twentyOneBetButton) hand.twentyOneBetButton.addEventListener('click', function() {
            playSound('button');
            const betType = 'TWENTYONE';
            setSelectedBetButton(this, betType);
            if (!betAllToggle.checked) {
                activeBetInput = hand.sideTwentyOneBetInput;
                if (activeBetInput) activeBetInput.focus();
            } else if (Array.isArray(activeBetInput) && activeBetInput.length > 0) {
                // activeBetInput[0].focus();
            }
        });

        return hand;
    }

    return {
        area: handEl,
        cardsDiv: document.getElementById(`cards-hand-${index}`),
        totalSpan: document.getElementById(`total-hand-${index}`),
        messageSpan: document.getElementById(`message-hand-${index}`),
        mainBetInput: document.getElementById(`main-bet-input-${index}`),
        sideTwentyOneBetInput: document.getElementById(`twentyone-bet-input-${index}`),
        sidePPBetInput: document.getElementById(`pp-bet-input-${index}`),
        mainBetDisplay: document.getElementById(`main-bet-${index}`),
        ppBetButton: document.getElementById(`pp-bet-${index}`),
        twentyOneBetButton: document.getElementById(`twentyone-bet-${index}`)
    };
}

function toggleBetElementsVisibilityForHand(handEl, isBettingPhase) {
    if (handEl.mainBetDisplay) handEl.mainBetDisplay.style.display = 'inline-block';
    if (handEl.ppBetButton) handEl.ppBetButton.style.display = 'flex';
    if (handEl.twentyOneBetButton) handEl.twentyOneBetButton.style.display = 'flex';

    const betButtons = [handEl.mainBetDisplay, handEl.ppBetButton, handEl.twentyOneBetButton];
    setButtonsDisabled(betButtons, !isBettingPhase);

    if (isBettingPhase) {
        if (handEl.mainBetInput) handEl.mainBetInput.style.display = 'inline-block';
        if (handEl.sideTwentyOneBetInput) handEl.sideTwentyOneBetInput.style.display = 'inline-block';
        if (handEl.sidePPBetInput) handEl.sidePPBetInput.style.display = 'inline-block';

        if (handEl.mainBetDisplay) handEl.mainBetDisplay.textContent = '';
        if (handEl.ppBetButton) handEl.ppBetButton.textContent = 'PP';
        if (handEl.twentyOneBetButton) handEl.twentyOneBetButton.textContent = '21+3';
    } else {
        if (handEl.mainBetInput) handEl.mainBetInput.style.display = 'none';
        if (handEl.sideTwentyOneBetInput) handEl.sideTwentyOneBetInput.style.display = 'none';
        if (handEl.sidePPBetInput) handEl.sidePPBetInput.style.display = 'none';
    }
}

function displayMessage(message, type = 'info') {
    if (gameMessageDiv) {
        gameMessageDiv.textContent = message;
        gameMessageDiv.className = `status-item game-message ${type}`;
        gameMessageDiv.style.display = "";

        // Only play error sound for actual errors, not losses
        if (type === 'error' && !message.startsWith('Net:')) {
            playSound('error');
        }
    }
}

// --- Bonus UI Logic ---
function updateBonusUI(canCollect, nextBonusTime, bonusCooldownMessage, playerChips) {
    console.log('updateBonusUI called:', { canCollect, nextBonusTime, bonusCooldownMessage });
    
    if (playerChipsSpan) {
        playerChipsSpan.textContent = `Balance: $${playerChips}`;
    }
    
    // Clear any existing countdown interval
    if (bonusCountdownInterval) {
        clearInterval(bonusCountdownInterval);
        bonusCountdownInterval = null;
    }
    
    // Handle the case where the bonus can be collected
    if (canCollect) {
        if (collectBtn) {
            collectBtn.disabled = false;
            collectBtn.textContent = 'Collect Bonus!';
            collectBtn.classList.remove('btn-disabled'); 
            collectBtn.classList.add('btn-primary');
        }
        if (Cooldown_msg) {
            Cooldown_msg.textContent = bonusCooldownMessage || "Bonus available!";
        }
        return; // Exit early since we don't need to set up a countdown
    }
    
    // Handle the case where there's a countdown to the next bonus
    if (nextBonusTime) {
        const nextCollectionDate = new Date(nextBonusTime);
        
        // Define the countdown update function
        const updateCountdown = () => {
            const now = new Date();
            const timeRemaining = nextCollectionDate.getTime() - now.getTime();
            
            // If countdown has reached zero, make bonus available
            if (timeRemaining <= 0) {
                if (Cooldown_msg) {
                    Cooldown_msg.textContent = "Bonus available!";
                }
                if (collectBtn) {
                    collectBtn.disabled = false;
                    collectBtn.textContent = 'Collect Bonus!';
                    collectBtn.classList.remove('btn-disabled');
                    collectBtn.classList.add('btn-primary');
                }
                clearInterval(bonusCountdownInterval);
                bonusCountdownInterval = null;
            } else {
                // Format the remaining time
                const totalSeconds = Math.floor(timeRemaining / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                const formattedTime =
                    `${hours.toString().padStart(2, '0')}h ` +
                    `${minutes.toString().padStart(2, '0')}m ` +
                    `${seconds.toString().padStart(2, '0')}s`;
                
                // Update the button and message
                if (collectBtn) {
                    collectBtn.disabled = true;
                    collectBtn.textContent = `Next in ${formattedTime}`;
                    collectBtn.classList.add('btn-disabled');
                    collectBtn.classList.remove('btn-primary');
                }
                if (Cooldown_msg) {
                    Cooldown_msg.textContent = `Next bonus in ${formattedTime}`;
                }
            }
        };
        
        // Run the countdown immediately and then set interval
        updateCountdown();
        bonusCountdownInterval = setInterval(updateCountdown, 1000);
    } else {
        // Handle the case where there's no next bonus time
        if (Cooldown_msg) {
            Cooldown_msg.textContent = bonusCooldownMessage || "Bonus not available";
        }
        if (collectBtn) {
            collectBtn.textContent = 'Collect Bonus'; 
            collectBtn.disabled = true;
            collectBtn.classList.add('btn-disabled');
            collectBtn.classList.remove('btn-primary');
        }
    }
}

/**
 * Updates the UI based on the current game state.
 * @param {Object} gameState - The game state object received from the backend.
 */
function updateUI(gameState) {
    currentGameState = gameState;

    const totalCards = countTotalCards(gameState);
    if (totalCards > lastTotalCards && gameState.game_phase === "dealing") {
        playSound('deal');
        // Store the previous balance right before placing bets
        previousBalance = parseInt(playerChipsSpan.textContent.replace(/[^0-9-]/g, '')) || 0;
        // Store in localStorage for persistence
        localStorage.setItem('previousBalance', previousBalance.toString());
        console.log('Storing previous balance:', previousBalance);
    }
    lastTotalCards = totalCards;

    // Adjust hand tracking
    if (gameState.player_hands.length !== lastPlayerHandCardCounts.length) {
        const newCounts = [];
        for (let i = 0; i < gameState.player_hands.length; i++) {
            newCounts[i] = lastPlayerHandCardCounts[i] || 0;
        }
        lastPlayerHandCardCounts = newCounts;
    }

    // Dealer cards
    if (gameState.dealer_hand.length < lastDealerCardCount) {
        clearCards(dealerCardsDiv);
        addCardImages(dealerCardsDiv, gameState.dealer_hand);
    } else if (gameState.dealer_hand.length > lastDealerCardCount) {
        addCardImages(dealerCardsDiv, gameState.dealer_hand.slice(lastDealerCardCount));
    }
    updateCardFaces(dealerCardsDiv, gameState.dealer_hand);
    lastDealerCardCount = gameState.dealer_hand.length;

    dealerTotalSpan.textContent = `Dealer: ${gameState.dealer_total}`;
    playerChipsSpan.textContent = `Balance: $${gameState.player_chips}`;
    displayMessage(gameState.game_message);

    const isBettingPhase = gameState.game_phase === "betting";
    const isRoundOver = gameState.game_phase === "round_over";
    const isPlayerTurn = gameState.game_phase === "player_turns";

    if (isBettingPhase) resultSoundsPlayed = false;

    // Hide all hand containers
    playerHandsContainer.querySelectorAll('.Player-Area').forEach(hand => {
        hand.style.cssText = 'display: none !important; visibility: hidden; pointer-events: none;';
    });

    let totalCurrentBet = 0;

    // Show and update hands
    gameState.player_hands.forEach((handData, i) => {
        const handEl = getOrCreatePlayerHandElement(handData.hand_index);
        if (!handEl) return;

        handEl.area.style.cssText = 'display: flex !important; visibility: visible; pointer-events: auto;';
        const cardsArr = handData.hand || [];

        if (cardsArr.length < lastPlayerHandCardCounts[i]) {
            clearCards(handEl.cardsDiv);
            addCardImages(handEl.cardsDiv, cardsArr);
        } else if (cardsArr.length > lastPlayerHandCardCounts[i]) {
            addCardImages(handEl.cardsDiv, cardsArr.slice(lastPlayerHandCardCounts[i]));
        }
        lastPlayerHandCardCounts[i] = cardsArr.length;

        handEl.totalSpan.textContent = `Total: ${handData.total || 0}`;
        // Format the result message
        let resultMessage = handData.result_message || "";
        // Replace side bet loss messages with simpler format
        resultMessage = resultMessage
            .replace(/Lost \$\d+ on 21\+3/g, 'Lost 21+3')
            .replace(/Lost \$\d+ on Perfect Pair/g, 'Lost PP')
            // Format all Perfect Pair win messages (Mixed, Colored, Perfect)
            .replace(/Won \$(\d+) on Perfect Pair \((Mixed|Colored|Perfect) Pair\)/g, 'Won $$$1 ($2 Pair)')
            // Format all 21+3 win messages
            .replace(/Won \$(\d+) on 21\+3 \((Suited Trips|Straight Flush|Three of a Kind|Straight|Flush)\)/g, 'Won $$$1 ($2)');
        handEl.messageSpan.textContent = resultMessage;

        // Update bet displays
        if (handEl.mainBetDisplay) {
            handEl.mainBetDisplay.style.visibility = 'visible';
            handEl.mainBetDisplay.textContent = handData.main_bet > 0 ? `$${handData.main_bet}` : '';
            updateBetButtonTextClass(handEl.mainBetDisplay, handData.main_bet);
        }
        if (handEl.ppBetButton) {
            handEl.ppBetButton.style.visibility = 'visible';
            handEl.ppBetButton.textContent = handData.side_bet_perfect_pair > 0 ? `$${handData.side_bet_perfect_pair}` : 'PP';
            updateBetButtonTextClass(handEl.ppBetButton, handData.side_bet_perfect_pair);
        }
        if (handEl.twentyOneBetButton) {
            handEl.twentyOneBetButton.style.visibility = 'visible';
            handEl.twentyOneBetButton.textContent = handData.side_bet_21_3 > 0 ? `$${handData.side_bet_21_3}` : '21+3';
            updateBetButtonTextClass(handEl.twentyOneBetButton, handData.side_bet_21_3);
        }

        // Inputs
        const inputs = [handEl.mainBetInput, handEl.sideTwentyOneBetInput, handEl.sidePPBetInput];
        if (isBettingPhase) {
            inputs.forEach((input, idx) => {
                if (input) {
                    input.style.display = 'inline-block';
                    input.value = [handData.main_bet, handData.side_bet_21_3, handData.side_bet_perfect_pair][idx] || 0;
                }
            });
        } else {
            inputs.forEach(input => input && (input.style.display = 'none'));
        }

        if (handData.is_active && isPlayerTurn) {
            handEl.area.classList.add('active-hand');
        } else {
            handEl.area.classList.remove('active-hand');
        }

        totalCurrentBet += (handData.main_bet || 0) + (handData.side_bet_21_3 || 0) + (handData.side_bet_perfect_pair || 0);
        updateCardFaces(handEl.cardsDiv, cardsArr);
    });

    totalBetDisplaySpan.textContent = `Total Bet: $${totalCurrentBet}`;

    // Round-end result + sounds + net change
    if (isRoundOver && !resultSoundsPlayed) {
        let blackjackWin = false;
    
        // Get actual balance values and use stored previous balance
        const currentBalance = parseInt(playerChipsSpan.textContent.replace(/[^0-9-]/g, '')) || 0;
        const storedPrevBalance = localStorage.getItem('previousBalance');
        // Use stored balance if available, otherwise use current previousBalance variable
        const prevBalance = storedPrevBalance ? parseInt(storedPrevBalance) : previousBalance;
        const totalNet = currentBalance - prevBalance;
        console.log('Net calculation:', { currentBalance, prevBalance, totalNet });
    
        // Check for blackjack
        gameState.player_hands.forEach(handData => {
            if (handData.blackjack && !handData.result_message.toLowerCase().includes("dealer has blackjack")) {
                blackjackWin = true;
            }
        });
    
        const messageType = totalNet > 0 ? "success" : totalNet < 0 ? "loss" : "info";
        displayMessage(`Net: $${totalNet}`, messageType);
    
        // Sound
        if (blackjackWin) playSound('blackjack');
        else if (totalNet > 0) playSound('win');
        else if (totalNet < 0) playSound('lose');
        else playSound('push');
    
        resultSoundsPlayed = true;
    }

    // Button logic
    setButtonsDisabled([dealBtn], !isBettingPhase);

    const allDone = gameState.player_hands.every(hand =>
        hand.stood || hand.busted || hand.blackjack
    );

    const showReBet = isBettingPhase || isRoundOver || allDone;
    setButtonsDisabled([reBetBtn], !showReBet);

    const showClearBets = (isBettingPhase || allDone) && !isRoundOver;
    setButtonsDisabled([clearBetsBtn], !showClearBets);

    const activeHand = gameState.player_hands.find(hand => hand.is_active);
    if (isPlayerTurn && activeHand) {
        setButtonsDisabled([hitBtn, standBtn], false);
        setButtonsDisabled([doubleBtn], !activeHand.can_double);
        setButtonsDisabled([splitBtn], !activeHand.can_split);
    } else {
        setButtonsDisabled([hitBtn, standBtn, doubleBtn, splitBtn], true);
    }

    const chipsContainer = document.querySelector('.chips');
    if (chipsContainer) chipsContainer.style.display = isBettingPhase ? 'flex' : 'none';

    const betAllToggleWrap = document.querySelector('.bet-all-toggle-wrap');
    if (betAllToggleWrap) betAllToggleWrap.style.display = isBettingPhase ? 'flex' : 'none';

    // Manage active bet button and input
    if (!isBettingPhase) {
        if (activeBetButton) {
            const clearStyle = btn => {
                if (btn) {
                    btn.classList.remove('selected');
                    btn.style.border = '2px solid transparent';
                    btn.style.boxShadow = 'none';
                }
            };
            if (Array.isArray(activeBetButton)) activeBetButton.forEach(clearStyle);
            else clearStyle(activeBetButton);
        }
        activeBetButton = null;
        activeBetInput = null;
    } else if (!activeBetButton && gameState.player_hands.length > 0) {
        const hand = getOrCreatePlayerHandElement(0);
        if (hand && hand.mainBetDisplay && hand.mainBetInput) {
            setSelectedBetButton(hand.mainBetDisplay);
            activeBetInput = hand.mainBetInput;
        }
    }

    if (gameState.hasOwnProperty('can_collect_bonus') && gameState.hasOwnProperty('next_bonus_time')) {
        updateBonusUI(
            gameState.can_collect_bonus,
            gameState.next_bonus_time,
            gameState.bonus_cooldown_message || '',
            gameState.player_chips
        );
    }
}

// --- API Calls ---
async function fetchGameState(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        const data = await response.json();

        if (data.success) {
            updateUI(data.game_state);
            // The redundant result processing block previously here (lines approx 877-948) has been removed.
            // updateUI now handles all game state updates, including round_over messages and sounds.
        } else {
            displayMessage(data.message || 'An unspecified error occurred.', 'error');
            if (data.game_state) {
                updateUI(data.game_state);
            }
        }
    } catch (error) {
        console.error('Fetch operation error:', error);
        displayMessage(`Network error: ${error.message}`, 'error');
    }
}

// --- Event Listeners ---

// Tooltip hover handlers
function handleBetAreaHover(event) {
    const tooltip = this.querySelector('.tooltip-bubble');
    if (tooltip) {
        tooltip.style.visibility = 'visible';
        tooltip.style.opacity = '1';
        tooltip.style.display = 'block';
    }
}

function handleBetAreaLeave(event) {
    const tooltip = this.querySelector('.tooltip-bubble');
    if (tooltip) {
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
    }
}

function attachHandEventListeners() {
    const numHands = document.querySelectorAll('.Player-Area').length;
    for (let i = 0; i < numHands; i++) {
        const hand = getOrCreatePlayerHandElement(i);
        if (!hand) continue;

        if (hand.mainBetInput) hand.mainBetInput.addEventListener('focus', () => {
            // When focusing an input directly (e.g., tabbing), select its button.
            // If Bet-All is on, it will select all of that type.
            setSelectedBetButton(hand.mainBetDisplay, 'MAIN'); 
            if (!betAllToggle.checked) { // If not bet all, ensure activeBetInput is just this one.
                 activeBetInput = hand.mainBetInput;
            }
        });
        if (hand.sideTwentyOneBetInput) hand.sideTwentyOneBetInput.addEventListener('focus', () => {
            setSelectedBetButton(hand.twentyOneBetButton, 'TWENTYONE');
            if (!betAllToggle.checked) {
                 activeBetInput = hand.sideTwentyOneBetInput;
            }
        });
        if (hand.sidePPBetInput) hand.sidePPBetInput.addEventListener('focus', () => {
            setSelectedBetButton(hand.ppBetButton, 'PP');
            if (!betAllToggle.checked) {
                 activeBetInput = hand.sidePPBetInput;
            }
        });

        if (hand.mainBetDisplay) hand.mainBetDisplay.addEventListener('click', function() {
            playSound('button');
            const betType = 'MAIN';
            setSelectedBetButton(this, betType);
            // If Bet-All is on, activeBetInput is already an array from setSelectedBetButton.
            // If not, set it to the corresponding single input.
            if (!betAllToggle.checked) {
                activeBetInput = hand.mainBetInput;
                if (activeBetInput) activeBetInput.focus();
            } else if (Array.isArray(activeBetInput) && activeBetInput.length > 0) {
                 // Optionally focus the first input in the array for bet-all
                 // activeBetInput[0].focus();
            }
        });
        if (hand.ppBetButton) hand.ppBetButton.addEventListener('click', function() {
            playSound('button');
            const betType = 'PP';
            setSelectedBetButton(this, betType);
            if (!betAllToggle.checked) {
                activeBetInput = hand.sidePPBetInput;
                if (activeBetInput) activeBetInput.focus();
            } else if (Array.isArray(activeBetInput) && activeBetInput.length > 0) {
                // activeBetInput[0].focus();
            }
        });
        if (hand.twentyOneBetButton) hand.twentyOneBetButton.addEventListener('click', function() {
            playSound('button');
            const betType = 'TWENTYONE';
            setSelectedBetButton(this, betType);
            if (!betAllToggle.checked) {
                activeBetInput = hand.sideTwentyOneBetInput;
                if (activeBetInput) activeBetInput.focus();
            } else if (Array.isArray(activeBetInput) && activeBetInput.length > 0) {
                // activeBetInput[0].focus();
            }
        });
    }
}

// Function to initialize the game and set up initial state
function initGame() {
    console.log('Initializing game...');
    // Any initial setup can go here
}

// Function to set up all event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    // Set up chip button event listeners
    chipButtons.forEach(button => {
        button.addEventListener('click', handleChipButtonClick);
    });
    
    // Attach event listeners to action buttons
    if (dealBtn) dealBtn.addEventListener('click', handleDealButtonClick);
    if (hitBtn) hitBtn.addEventListener('click', handleHitButtonClick);
    if (standBtn) standBtn.addEventListener('click', handleStandButtonClick);
    if (doubleBtn) doubleBtn.addEventListener('click', handleDoubleButtonClick);
    if (splitBtn) splitBtn.addEventListener('click', handleSplitButtonClick);
    if (clearBetsBtn) clearBetsBtn.addEventListener('click', handleClearBetsButtonClick);
    if (reBetBtn) reBetBtn.addEventListener('click', handleReBetButtonClick);
    
    // Attach hand event listeners
    attachHandEventListeners();
}

// Function to load the game state from the server
function loadGameState() {
    console.log('Loading game state...');
    fetchGameState('/api/start_game', { method: 'POST' });
}

document.addEventListener('DOMContentLoaded', () => {
    fetchGameState('/api/start_game', { method: 'POST' });
    attachHandEventListeners();
    
    // Add hover sound to all action buttons
    addHoverSound(dealBtn);
    addHoverSound(hitBtn);
    addHoverSound(standBtn);
    addHoverSound(doubleBtn);
    addHoverSound(splitBtn);
    addHoverSound(clearBetsBtn);
    addHoverSound(reBetBtn);
    addHoverSound(collectBtn);
    addHoverSound(document.getElementById('volumeButton'));

    // Add hover sound to all chip buttons
    document.querySelectorAll('.chips button').forEach(button => {
        addHoverSound(button);
    });

    const initialHandEl = getOrCreatePlayerHandElement(0);
    if (initialHandEl && initialHandEl.mainBetInput && initialHandEl.mainBetDisplay) {
        activeBetInput = initialHandEl.mainBetInput;
        setSelectedBetButton(initialHandEl.mainBetDisplay);
        activeBetInput.focus();
    }
    // --- Volume Toggle Logic ---
    const volumeButton = document.getElementById('volumeButton');
    const volumeIcon = document.getElementById('volumeIcon');

    if (volumeButton && volumeIcon) { // Add null check
        volumeButton.addEventListener('click', () => {
            playSound('button');
            isMuted = !isMuted;
    
            // Change icon
            volumeIcon.src = isMuted
                ? '/static/Images/Icons/mute.png'
                : '/static/Images/Icons/vol.png';
    
            // Update sound objects
            updateMuteState();
    
            // Optional: Show message
            displayMessage(isMuted ? "Sound muted." : "Sound on.");
        });
    }

    // Bet-All Toggle Logic
    if (betAllToggle) { // Add null check
        betAllToggle.addEventListener('change', () => {
            if (!betAllToggle.checked) {
                // If Bet-All is turned off, deselect all buttons and clear activeBetInput
                if (activeBetButton) {
                    if (Array.isArray(activeBetButton)) {
                        activeBetButton.forEach(btn => {
                            if (btn) {
                                btn.classList.remove('selected');
                                btn.style.border = '2px solid transparent';
                                btn.style.boxShadow = 'none';
                            }
                        });
                    } else {
                        activeBetButton.classList.remove('selected');
                        activeBetButton.style.border = '2px solid transparent';
                        activeBetButton.style.boxShadow = 'none';
                    }
                }
                activeBetButton = null;
                activeBetInput = null;
            } else {
                // If Bet-All is turned on, and a single button was selected, 
                // expand selection to all of its type.
                if (activeBetButton && !Array.isArray(activeBetButton)) {
                    let betTypeClass = null;
                    if (activeBetButton.classList.contains('PP')) betTypeClass = 'PP';
                    else if (activeBetButton.classList.contains('MAIN')) betTypeClass = 'MAIN';
                    else if (activeBetButton.classList.contains('TWENTYONE')) betTypeClass = 'TWENTYONE';
                    
                    if (betTypeClass) {
                        setSelectedBetButton(activeBetButton, betTypeClass); // Reselect with Bet-All logic
                    }
                } else {
                  // If nothing was selected, or already in bet-all mode, clear selections
                  // to avoid weird states. User must click again to select all of a type.
                   if (activeBetButton) {
                        if (Array.isArray(activeBetButton)) {
                            activeBetButton.forEach(btn => {
                                if (btn) {
                                    btn.classList.remove('selected');
                                    btn.style.border = '2px solid transparent';
                                    btn.style.boxShadow = 'none';
                                }
                            });
                        } else {
                            activeBetButton.classList.remove('selected');
                            activeBetButton.style.border = '2px solid transparent';
                            activeBetButton.style.boxShadow = 'none';
                        }
                    }
                    activeBetButton = null;
                    activeBetInput = null;
                }
            }
        });
    }

    // Ensure discard pile has a back card image
    const discardDiv = document.querySelector('.Discard');
    if (discardDiv && !discardDiv.querySelector('img')) {
        const backImg = document.createElement('img');
        backImg.src = '/static/Images/cards/back.png';
        backImg.alt = 'Discard Pile';
        discardDiv.appendChild(backImg);
    }

    // Ensure tooltips are shown on hover and focus
    const betAreaButtons = document.querySelectorAll('.bet-area-button');
    betAreaButtons.forEach(button => {
        button.addEventListener('mouseenter', () => {
            const tooltip = button.querySelector('.tooltip-bubble');
            if (tooltip) {
                tooltip.style.visibility = 'visible';
                tooltip.style.opacity = '1';
                console.log('Tooltip shown on hover');
            }
        });
        button.addEventListener('mouseleave', () => {
            const tooltip = button.querySelector('.tooltip-bubble');
            if (tooltip) {
                tooltip.style.visibility = 'hidden';
                tooltip.style.opacity = '0';
                console.log('Tooltip hidden on leave');
            }
        });
        button.addEventListener('focus', () => {
            const tooltip = button.querySelector('.tooltip-bubble');
            if (tooltip) {
                tooltip.style.visibility = 'visible';
                tooltip.style.opacity = '1';
                console.log('Tooltip shown on focus');
            }
        });
        button.addEventListener('blur', () => {
            const tooltip = button.querySelector('.tooltip-bubble');
            if (tooltip) {
                tooltip.style.visibility = 'hidden';
                tooltip.style.opacity = '0';
                console.log('Tooltip hidden on blur');
            }
        });
    });
});

// Chip buttons click handler
chipButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (!currentGameState || currentGameState.game_phase !== 'betting') {
            displayMessage("You can only place bets during the betting phase.", 'error');
            return;
        }

        if (activeBetInput && (!Array.isArray(activeBetInput) || activeBetInput.length > 0)) {
            const chipValue = parseInt(button.dataset.chipValue);
            let totalBetAcrossAllZonesAfterThisChip = 0;

            // First, calculate the sum of all bets *not* being modified by this chip click
            const handElements = playerHandsContainer.querySelectorAll('.Player-Area');
            handElements.forEach((handElDiv, index) => {
                const handEl = getOrCreatePlayerHandElement(index);
                if (!handEl) return;

                const inputsToCheck = [
                    { input: handEl.mainBetInput, type: 'MAIN' }, 
                    { input: handEl.sideTwentyOneBetInput, type: 'TWENTYONE' }, 
                    { input: handEl.sidePPBetInput, type: 'PP' }
                ];

                inputsToCheck.forEach(item => {
                    let isCurrentlyActiveTarget = false;
                    if (betAllToggle.checked && Array.isArray(activeBetInput)) {
                        // Check if this input is part of the activeBetInput array
                        if (activeBetInput.includes(item.input)) {
                            isCurrentlyActiveTarget = true;
                        }
                    } else if (activeBetInput === item.input) {
                        isCurrentlyActiveTarget = true;
                    }

                    if (!isCurrentlyActiveTarget) {
                        totalBetAcrossAllZonesAfterThisChip += (parseInt(item.input.value) || 0);
                    }
                });
            });
            
            // Now, calculate the sum of the bets *being* modified, including the new chip
            let sumOfModifiedBets = 0;
            const inputsToUpdate = Array.isArray(activeBetInput) ? activeBetInput : [activeBetInput];
            
            for (const input of inputsToUpdate) {
                if (input && !input.disabled) {
                     sumOfModifiedBets += (parseInt(input.value) || 0) + chipValue;
                }
            }
            totalBetAcrossAllZonesAfterThisChip += sumOfModifiedBets;

            if (currentGameState.player_chips < totalBetAcrossAllZonesAfterThisChip) {
                displayMessage("Not enough chips for total bet!", 'error');
                playSound('error');
                return;
            }

            // If balance check passes, apply the chip to the active input(s)
            inputsToUpdate.forEach(input => {
                if (input && !input.disabled) {
                    let currentValue = parseInt(input.value) || 0;
                    let newValue = currentValue + chipValue;
                    input.value = newValue;

                    const handIndex = parseInt(input.closest('.Player-Area').id.replace('hand-', ''));
                    const handEl = getOrCreatePlayerHandElement(handIndex);

                    if (input === handEl.mainBetInput) {
                        handEl.mainBetDisplay.textContent = `$${newValue}`;
                        updateBetButtonTextClass(handEl.mainBetDisplay, newValue);
                    } else if (input === handEl.sidePPBetInput) {
                        handEl.ppBetButton.textContent = `$${newValue}`;
                        updateBetButtonTextClass(handEl.ppBetButton, newValue);
                    } else if (input === handEl.sideTwentyOneBetInput) {
                        handEl.twentyOneBetButton.textContent = `$${newValue}`;
                        updateBetButtonTextClass(handEl.twentyOneBetButton, newValue);
                    }
                }
            });

            updateTotalBetDisplay();
            playSound('chip');
        } else {
            displayMessage("Please select a bet area (PP, Main, or 21+3) first.", 'error');
        }
    });
});

function updateTotalBetDisplay() {
    let currentTotalBet = 0;
    const handElements = playerHandsContainer.querySelectorAll('.Player-Area');
    handElements.forEach((handElDiv, index) => {
        const handEl = getOrCreatePlayerHandElement(index);
        if (!handEl) return;
        currentTotalBet += (parseInt(handEl.mainBetInput.value) || 0);
        currentTotalBet += (parseInt(handEl.sideTwentyOneBetInput.value) || 0);
        currentTotalBet += (parseInt(handEl.sidePPBetInput.value) || 0);
    });
    totalBetDisplaySpan.textContent = `Total Bet: $${currentTotalBet}`;
}

/**
 * Updates the CSS classes on bet buttons to adjust text size based on content
 * @param {HTMLElement} buttonElement - The button element to update
 * @param {number} betAmount - The bet amount (if any)
 */
function updateBetButtonTextClass(buttonElement, betAmount) {
    if (!buttonElement) return;
    
    // Remove existing classes
    buttonElement.classList.remove('has-bet', 'large-bet', 'very-large-bet');
    
    // Add appropriate classes based on bet amount
    if (betAmount > 0) {
        buttonElement.classList.add('has-bet');
        
        // For larger amounts that might need smaller text
        if (betAmount >= 10000) {
            buttonElement.classList.add('very-large-bet');
        } else if (betAmount >= 1000) {
            buttonElement.classList.add('large-bet');
        }
    }
}

function animateDiscardCards() {
    const discardImg = document.querySelector('.Discard img');
    if (!discardImg) return;
    const targetRect = discardImg.getBoundingClientRect();

    const cardImgs = document.querySelectorAll('.cards img, #dealer-cards img');
    if (cardImgs.length === 0) return;

    cardImgs.forEach((original, idx) => {
        const rect = original.getBoundingClientRect();
        const clone = original.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.transition = `transform ${CARD_DISCARD_ANIMATION_SPEED / 1000}s cubic-bezier(0.34,1.56,0.64,1), opacity ${CARD_DISCARD_ANIMATION_SPEED / 1000}s`;
        document.body.appendChild(clone);

        setTimeout(() => {
            requestAnimationFrame(() => {
                const dx = targetRect.left + 20 - rect.left;
                const dy = targetRect.top + 20 - rect.top;
                clone.style.transform = `translate(${dx}px, ${dy}px) scale(0.3)`;
                clone.style.opacity = '0';
            });
        }, idx * CARD_ANIMATION_DELAY_BETWEEN_CARDS); // Use the new delay variable

        clone.addEventListener('transitionend', () => clone.remove(), { once: true });
    });

    // Remove originals after a slight delay to allow clones to start animating
    setTimeout(() => {
        cardImgs.forEach(img => img.remove());
    }, CARD_ANIMATION_DELAY_BETWEEN_CARDS); // Use delay here too for consistency
}

dealBtn.addEventListener('click', () => {
    const now = Date.now();
    if (now - dealBtnLastClick < CLICK_THROTTLE_DELAY) {
        console.log("Deal button click throttled");
        return;
    }
    dealBtnLastClick = now;

    playSound('deal');
    const bets = [];
    let hasValidBet = false;
    const numHandsToCollectBetsFrom = currentGameState ? currentGameState.num_hands : playerHandsContainer.children.length;

    // Store the previous balance right before placing bets
    previousBalance = parseInt(playerChipsSpan.textContent.replace(/[^0-9-]/g, '')) || 0;
    // Store in localStorage for persistence
    localStorage.setItem('previousBalance', previousBalance.toString());
    console.log('Storing previous balance:', previousBalance);

    // Ensure bets array always has length equal to numHandsToCollectBetsFrom
    for (let i = 0; i < numHandsToCollectBetsFrom; i++) {
        const handEl = getOrCreatePlayerHandElement(i);
        if (!handEl) {
            // If element missing, push zero bets to maintain length
            bets.push({ main_bet: 0, side_21_3: 0, side_pp: 0 });
            continue;
        }

        const mainBet = parseInt(handEl.mainBetInput.value) || 0;
        let sideTwentyOne = parseInt(handEl.sideTwentyOneBetInput.value) || 0;
        let sidePP = parseInt(handEl.sidePPBetInput.value) || 0;

        if (mainBet === 0) {
            // Clear side bets if no main bet for this hand
            sideTwentyOne = 0;
            sidePP = 0;

            // Reflect in UI
            if (handEl.sideTwentyOneBetInput) {
                handEl.sideTwentyOneBetInput.value = 0;
            }
            if (handEl.twentyOneBetButton) {
                handEl.twentyOneBetButton.textContent = '21+3';
            }
            if (handEl.sidePPBetInput) {
                handEl.sidePPBetInput.value = 0;
            }
            if (handEl.ppBetButton) {
                handEl.ppBetButton.textContent = 'PP';
            }
        } else {
            hasValidBet = true;
        }

        bets.push({
            main_bet: mainBet,
            side_21_3: sideTwentyOne,
            side_pp: sidePP
        });
    }

    if (!hasValidBet) {
        playSound('error');
        displayMessage("You must place a main bet on at least one hand.", 'error');
        return;
    }

    setSelectedBetButton(null);
    activeBetInput = null;

    fetchGameState('/api/place_bets', {
        method: 'POST',
        body: JSON.stringify({ bets: bets })
    });
});

hitBtn.addEventListener('click', () => {
    const now = Date.now();
    if (now - hitBtnLastClick < CLICK_THROTTLE_DELAY) {
        console.log("Hit button click throttled");
        return;
    }
    hitBtnLastClick = now;

    playSound('carddeal');
    if (currentGameState && currentGameState.current_active_hand_index !== -1) {
        fetchGameState('/api/player_action', {
            method: 'POST',
            body: JSON.stringify({ action: 'hit', hand_index: currentGameState.current_active_hand_index })
        });
    } else {
        displayMessage("No active hand to hit.", 'error');
    }
});

standBtn.addEventListener('click', () => {
    const now = Date.now();
    if (now - standBtnLastClick < CLICK_THROTTLE_DELAY) {
        console.log("Stand button click throttled");
        return;
    }
    standBtnLastClick = now;

    playSound('button');
    if (currentGameState && currentGameState.current_active_hand_index !== -1) {
        fetchGameState('/api/player_action', {
            method: 'POST',
            body: JSON.stringify({ action: 'stand', hand_index: currentGameState.current_active_hand_index })
        });
    } else {
        displayMessage("No active hand to stand.", 'error');
    }
});

doubleBtn.addEventListener('click', () => {
    const now = Date.now();
    if (now - doubleBtnLastClick < CLICK_THROTTLE_DELAY) {
        console.log("Double button click throttled");
        return;
    }
    doubleBtnLastClick = now;

    playSound('carddeal');
    if (currentGameState && currentGameState.current_active_hand_index !== -1) {
        fetchGameState('/api/player_action', {
            method: 'POST',
            body: JSON.stringify({ action: 'double', hand_index: currentGameState.current_active_hand_index })
        });
    } else {
        displayMessage("No active hand to double down.", 'error');
    }
});

splitBtn.addEventListener('click', () => {
    const now = Date.now();
    if (now - splitBtnLastClick < CLICK_THROTTLE_DELAY) {
        console.log("Split button click throttled");
        return;
    }
    splitBtnLastClick = now;

    playSound('carddeal');
    if (currentGameState && currentGameState.current_active_hand_index !== -1) {
        fetchGameState('/api/player_action', {
            method: 'POST',
            body: JSON.stringify({ action: 'split', hand_index: currentGameState.current_active_hand_index })
        });
    } else {
        displayMessage("No active hand to split.", 'error');
    }
});

clearBetsBtn.addEventListener('click', () => {
    const now = Date.now();
    if (now - clearBetsBtnLastClick < CLICK_THROTTLE_DELAY) {
        console.log("Clear Bets button click throttled");
        return;
    }
    clearBetsBtnLastClick = now;

    playSound('chip');
    if (currentGameState && currentGameState.game_phase === "round_over") {
        playSound('deal');
    }
    animateDiscardCards();
    const numHandsInDOM = playerHandsContainer.children.length;
    for (let i = 0; i < numHandsInDOM; i++) {
        const handEl = getOrCreatePlayerHandElement(i);
        if (!handEl) continue;
        if (handEl.mainBetInput) handEl.mainBetInput.value = 0;
        if (handEl.sideTwentyOneBetInput) handEl.sideTwentyOneBetInput.value = 0;
        if (handEl.sidePPBetInput) handEl.sidePPBetInput.value = 0;

        if (handEl.mainBetDisplay) handEl.mainBetDisplay.textContent = '';
        if (handEl.ppBetButton) handEl.ppBetButton.textContent = 'PP';
        if (handEl.twentyOneBetButton) handEl.twentyOneBetButton.textContent = '21+3';
    }
    displayMessage("Bets cleared.");
    updateTotalBetDisplay();
});

reBetBtn.addEventListener('click', () => {
    const now = Date.now();
    if (now - reBetBtnLastClick < CLICK_THROTTLE_DELAY) {
        console.log("ReBet button click throttled");
        return;
    }
    reBetBtnLastClick = now;

    // Play appropriate sound based on game phase
    if (currentGameState && currentGameState.game_phase === "round_over") {
        playSound('deal');
    } else {
        playSound('chip');
    }
    
    animateDiscardCards();
    
    // Wait for animation to complete before making the API call
    setTimeout(() => {
        handleRebet();
    }, 800);
});

// --- Collect Button Handler (NEW) ---
collectBtn.addEventListener('click', () => {
    playSound('button');
    // Disable button immediately to prevent multiple clicks
    collectBtn.disabled = true;
    collectBtn.classList.add('btn-disabled');
    collectBtn.classList.remove('btn-primary');
    collectBtn.textContent = 'Collecting...';
    if (Cooldown_msg) Cooldown_msg.textContent = '';
    
    fetch('/api/collect_chips', { method: 'POST' })
        .then(response => {
            // First handle non-OK responses without trying to parse JSON
            if (!response.ok) {
                // For non-JSON responses or network errors
                if (response.status === 0 || response.type === 'opaque') {
                    throw new Error('Network error or CORS issue');
                }
                
                // Try to get JSON error message if available
                return response.json()
                    .then(errData => {
                        throw new Error(errData.message || `HTTP error! status: ${response.status}`);
                    })
                    .catch(jsonError => {
                        // If JSON parsing fails, use status text
                        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
                    });
            }
            return response.json();
        })
        .then(data => {
            console.log('Collect bonus response:', data);
            
            if (data.success) {
                playSound('bonus');
                displayMessage(data.message, 'success');
                
                // Update UI with the new game state
                if (data.game_state) {
                    // Ensure the next_bonus_time is properly formatted
                    if (data.game_state.next_bonus_time) {
                        // Make sure it's a valid date string
                        const nextBonusTime = new Date(data.game_state.next_bonus_time);
                        if (!isNaN(nextBonusTime.getTime())) {
                            // Valid date, update UI with countdown
                            updateBonusUI(
                                data.game_state.can_collect_bonus,
                                data.game_state.next_bonus_time,
                                data.game_state.bonus_cooldown_message,
                                data.game_state.player_chips
                            );
                        } else {
                            console.error('Invalid next_bonus_time:', data.game_state.next_bonus_time);
                            // Handle invalid date
                            collectBtn.disabled = true;
                            collectBtn.textContent = 'Cooldown Active';
                            collectBtn.classList.add('btn-disabled');
                            collectBtn.classList.remove('btn-primary');
                        }
                    } else {
                        // No next_bonus_time provided
                        updateBonusUI(
                            data.game_state.can_collect_bonus,
                            null,
                            data.game_state.bonus_cooldown_message,
                            data.game_state.player_chips
                        );
                    }
                } else {
                    // If no game state was returned, show generic message
                    collectBtn.disabled = true;
                    collectBtn.textContent = 'Cooldown Active';
                    collectBtn.classList.add('btn-disabled');
                    collectBtn.classList.remove('btn-primary');
                    if (Cooldown_msg) Cooldown_msg.textContent = 'Bonus collected. Cooldown active.';
                }
            } else {
                playSound('error');
                displayMessage(data.message, 'error');
                
                if (data.game_state) {
                    updateBonusUI(
                        data.game_state.can_collect_bonus,
                        data.game_state.next_bonus_time,
                        data.game_state.bonus_cooldown_message,
                        data.game_state.player_chips
                    );
                } else {
                    // If no game state was returned, reset the button
                    collectBtn.disabled = false;
                    collectBtn.classList.remove('btn-disabled');
                    collectBtn.classList.add('btn-primary');
                    collectBtn.textContent = 'Collect Bonus';
                    if (Cooldown_msg) Cooldown_msg.textContent = data.message || 'Bonus not available';
                }
            }
        })
        .catch(error => {
            console.error('Collect bonus error:', error);
            playSound('error');
            displayMessage(`Failed to collect bonus: ${error.message || 'Network error'}`, 'error');
            
            // Reset button state on error
            collectBtn.disabled = false;
            collectBtn.classList.remove('btn-disabled');
            collectBtn.classList.add('btn-primary');
            collectBtn.textContent = 'Collect Bonus';
            if (Cooldown_msg) Cooldown_msg.textContent = 'Error during collection.';
        });
});

function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msFullscreenElement();
    }
}

async function handleRebet() {
    try {
        const response = await fetch('/api/rebet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (data.success) {
            updateUI(data.game_state);
            
            // Play deal sound if we're in round_over phase
            if (data.game_state && data.game_state.game_phase === "round_over") {
                playSound('deal');
            }
            
            // Apply the last bets to the UI
            if (data.last_bets && Array.isArray(data.last_bets)) {
                data.last_bets.forEach((bet, index) => {
                    const handEl = getOrCreatePlayerHandElement(index);
                    if (!handEl) return;

                    // Update input values
                    if (handEl.mainBetInput) handEl.mainBetInput.value = bet.main_bet || 0;
                    if (handEl.sideTwentyOneBetInput) handEl.sideTwentyOneBetInput.value = bet.side_21_3 || 0;
                    if (handEl.sidePPBetInput) handEl.sidePPBetInput.value = bet.side_pp || 0;

                    // Update display buttons
                    if (handEl.mainBetDisplay) {
                        handEl.mainBetDisplay.textContent = bet.main_bet > 0 ? `$${bet.main_bet}` : '';
                        updateBetButtonTextClass(handEl.mainBetDisplay, bet.main_bet);
                    }
                    if (handEl.ppBetButton) {
                        handEl.ppBetButton.textContent = bet.side_pp > 0 ? `$${bet.side_pp}` : 'PP';
                        updateBetButtonTextClass(handEl.ppBetButton, bet.side_pp);
                    }
                    if (handEl.twentyOneBetButton) {
                        handEl.twentyOneBetButton.textContent = bet.side_21_3 > 0 ? `$${bet.side_21_3}` : '21+3';
                        updateBetButtonTextClass(handEl.twentyOneBetButton, bet.side_21_3);
                    }
                });
            }

            // Focus on first hand with a bet
            if (data.game_state.game_phase === 'betting') {
                const firstHandWithBet = data.last_bets?.findIndex(bet => bet.main_bet > 0 || bet.side_21_3 > 0 || bet.side_pp > 0);
                if (firstHandWithBet !== -1) {
                    const handEl = getOrCreatePlayerHandElement(firstHandWithBet);
                    if (handEl && handEl.mainBetInput && handEl.mainBetDisplay) {
                        activeBetInput = handEl.mainBetInput;
                        setSelectedBetButton(handEl.mainBetDisplay);
                        activeBetInput.focus();
                    }
                }
            }

            displayMessage(data.message, 'success');
            updateTotalBetDisplay();
        } else {
            displayMessage("Error rebetting: " + data.message, 'error');
        }
    } catch (error) {
        displayMessage("An error occurred during rebet: " + error.message, 'error');
    }
}

// Add hover sound to all buttons
function addHoverSound(button) {
    if (!button) return;
    button.addEventListener('mouseenter', () => {
        if (!button.classList.contains('disabled')) {
            playSound('button_hover');
        }
    });
}