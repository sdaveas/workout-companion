// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ScreenHeader } from './ScreenHeader';

afterEach(cleanup);

describe('ScreenHeader', () => {
  it('links to the declared parent route', () => {
    render(<ScreenHeader back={{ to: '#/programs', label: 'Programs' }} title={<h1>Detail</h1>} />);
    const link = screen.getByRole('link', { name: 'Back to Programs' });
    expect(link.getAttribute('href')).toBe('#/programs');
    expect(link.textContent).toContain('←');
    expect(link.textContent).toContain('Programs');
    expect(screen.getByRole('heading', { name: 'Detail' })).toBeTruthy();
  });

  it('drops the text label in compact mode but keeps the accessible name', () => {
    render(<ScreenHeader back={{ to: '#/', label: 'Home', compact: true }} />);
    const link = screen.getByRole('link', { name: 'Back to Home' });
    expect(link.textContent).not.toContain('Home');
  });

  it('renders no back control on the root screen', () => {
    render(<ScreenHeader title={<h1>Home</h1>} />);
    expect(screen.queryByRole('link')).toBe(null);
  });

  it('runs the exit handler without swallowing the link', () => {
    const onSelect = vi.fn();
    render(<ScreenHeader back={{ to: '#/', label: 'Home', onSelect }} />);
    const link = screen.getByRole('link', { name: 'Back to Home' });
    fireEvent.click(link);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(link.getAttribute('href')).toBe('#/');
  });
});
