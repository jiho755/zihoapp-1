document.getElementById('generate').addEventListener('click', () => {
    const numbersContainer = document.getElementById('numbers');
    numbersContainer.innerHTML = ''; // 이전 번호 삭제

    const numbers = new Set();
    while (numbers.size < 6) {
        const randomNumber = Math.floor(Math.random() * 45) + 1;
        numbers.add(randomNumber);
    }

    const sortedNumbers = Array.from(numbers).sort((a, b) => a - b);

    sortedNumbers.forEach(number => {
        const numberElement = document.createElement('div');
        numberElement.classList.add('number');
        numberElement.textContent = number;
        numbersContainer.appendChild(numberElement);
    });
});
