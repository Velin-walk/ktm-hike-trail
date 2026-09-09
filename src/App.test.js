import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('./components/MapView', () => () => <div data-testid="map" />);
jest.mock('./components/RouteCard', () => () => <div data-testid="route-card" />);
jest.mock('./components/RouteDetail', () => () => <div data-testid="route-detail" />);

import App from './App';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => ({}),
      text: () => '',
    })
  );
});

test('shows the contribution CTA from the earlier working app', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: /contribute map/i })).toBeInTheDocument();
});

test('opens the auth dialog when contribution is clicked without a signed-in user', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /contribute map/i }));
  expect(screen.getByText(/sign in to contribute/i)).toBeInTheDocument();
});
