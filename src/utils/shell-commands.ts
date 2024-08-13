import { ERROR_BOL } from './actions';

export const unixSourceCommand = `
if [ -n "$ZSH_VERSION" ]; then
    # Zsh shell
    if [ "$(uname)" = "Darwin" ]; then
        echo "source ~/.zshrc"   # macOS
    else
        echo "source ~/.zshrc"   # Linux
    fi
elif [ -n "$BASH_VERSION" ]; then
    # Bash shell
    if [ "$(uname)" = "Darwin" ]; then
        echo "source ~/.bash_profile"  # macOS
    else
        echo "source ~/.bashrc"  # Linux
    fi
elif [ -n "$FISH_VERSION" ]; then
    # Fish shell
    if [ "$(uname)" = "Darwin" ]; then
        echo "source ~/.config/fish/config.fish"  # macOS
    else
        echo "source ~/.config/fish/config.fish"  # Linux
    fi
else
    echo "${ERROR_BOL} Unsupported shell. Please source the appropriate RC file manually."
fi
`;
